const request = require('request');
const util = require('util');

require("./config.js")();
var database = require('./database');
var alias_database= new database.alias_database();

var events = require('events');
var eventEmitter = new events.EventEmitter();



let username = cnf_username;
let password = cnf_password;



var counter=0;
var current_block_height=0;

var read_block_height=cnf_read_block_height;

var process_read_blocks=false;
var process_rewind_blocks=false;
var accept_new_syncing_wallet=false;
var process_syncing_to_wallets_array={};

var startup=true;

var compare_blocks=[];//
var orphan_read_start=-1;
var orphan_read_current=-1;
var orphan_read_end=-1;
var rewind_list=[];

//mempool
var global_mempool_reading=false;
var global_mempool_ids=[];
var global_mempool_output_list=[];
var global_mempool_output_list_string="";

var global_mempool_i=0;
var global_mempool_j=0;

//currencies/Alias
var alias_prices=null;

var request_error_counter=0;

//Create an event handler:
var mainloop =  async function () {
   //sync
   if(startup){
    startup=false;   
    var db_height=await alias_database.get_current_db_blockheight();
    console.log(db_height);
    if(db_height!=undefined){
        read_block_height=db_height.blockheight+1; // +1 do not read twice 
        console.log(read_block_height);
        rewind_list= await alias_database.get_rewinds(); //set rewind array
        //initial rewind check
        process_read_blocks=false;        
        process_rewind_blocks= true;
        orphan_read_start = read_block_height - 1000 - 1;
        orphan_read_current = orphan_read_start;
        orphan_read_end = read_block_height - 1;
        rewind_blocks_check(); 
    }
   }
   
   
   if(Object.keys(process_syncing_to_wallets_array).length>0){
       
       setTimeout(function(){
            eventEmitter.emit('next');
       },500);
       return;
   }else{
        request_rpc("getblockcount",null,"getblockcount");
   }
   

  
  //main running every 15 sec
  console.log("log main: "+new Date().toLocaleString());
    setTimeout(function(){
        eventEmitter.emit('next');
    },15000);
}

//Assign the event handler to an event:
eventEmitter.on('next', mainloop);
//Fire the 'scream' event:
eventEmitter.emit('next');


//mempool read interval
var read_raw_mempool = function (error, data) {
    if(error){
        console.error("Could not read mempool!");
        global_mempool_reading=false;
        return;
    }
    try {
//        console.log("read_raw_mempool: ", data);
        var j_dat = JSON.parse(data);
        global_mempool_ids=j_dat.result;
//        console.log(global_mempool_ids);
        
        global_mempool_i=0;
        global_mempool_j=0;
        global_mempool_output_list=[];
        
        if(global_mempool_ids!=null && global_mempool_i<global_mempool_ids.length){
            request_rpc("gettxout",[global_mempool_ids[global_mempool_i],global_mempool_j,true],"event_read_next_mempool_output");
        }
        else{
             global_mempool_reading=false;
        }
    } catch (e) {
        console.error(e);
        global_mempool_reading=false;
    }
} 

var read_next_mempool_output = function (error, data) {
    try {
        if (error) {
            console.error("Could not read mempool OUTPUT" + global_mempool_i + "/" + global_mempool_j + "!");
            global_mempool_reading = false;
            return;
        }
        var j_dat = JSON.parse(data);
        var res=j_dat.result;
//        console.log(res);
        if(res!=null){         
            res.tx=global_mempool_ids[global_mempool_i];
            res.num=global_mempool_j;
            if (res.value == 0 && res.scriptPubKey.hex.startsWith("6a026e706a") && global_mempool_output_list.length>0){
                if(global_mempool_output_list[global_mempool_output_list.length-1].scriptPubKey.addresses!=undefined){
                res.scriptPubKey.addresses=global_mempool_output_list[global_mempool_output_list.length-1].scriptPubKey.addresses;}
            }
                       
            global_mempool_output_list.push(res);
            global_mempool_j++;
        }
        else{
            global_mempool_i++;
             global_mempool_j=0;
        }

        
        if (global_mempool_i < global_mempool_ids.length) {
            request_rpc("gettxout",[global_mempool_ids[global_mempool_i],global_mempool_j,true],"event_read_next_mempool_output");
        } else {
//            console.log("global_mempool_output_list:\n",global_mempool_output_list);  
            global_mempool_output_list_string=JSON.stringify(global_mempool_output_list);
            global_mempool_reading = false;
        }

    } catch (e) {
        console.error(e);
        global_mempool_reading = false;
    }
}


eventEmitter.on('event_read_raw_mempool', read_raw_mempool);
eventEmitter.on('event_read_next_mempool_output', read_next_mempool_output);

//mempool interval
setInterval(async function(){
    if(!global_mempool_reading && !process_read_blocks && !process_rewind_blocks){      
        global_mempool_reading=true;       
        request_rpc("getrawmempool",null,"event_read_raw_mempool");
    }    
},500);

//
if (cnf_get_alias_prices) {
    set_alias_prices();
    setInterval(async function () {      
        set_alias_prices();
    }, (180 * 1000));
}

//**********************************************
//start the server for light wallet

const io = require('socket.io')(3000,{pingTimeout: 20000, pingInterval: 2500});

io.on('connection', socket => {
  var address_list=[];  
    
   //this will be replaced by the POW Ddos token when switched to TOR 
  var socket_id = socket.id;
//  console.log(socket);
  console.log('New connection ID: ' + socket_id);
    
  // either with send()
  socket.send('You\'re connected to the Aliwa server.');

  // handle the event sent with socket.send()
  socket.on('message', (data) => {
    console.log(data);
  });

  // handle the event sent with socket.emit()
  socket.on('sync_from', async (from,list,last_rewind,sync_id) =>  {
      address_list=list;
       if(accept_new_syncing_wallet){         
          process_syncing_to_wallets_array[socket_id]=1; //server can not sync while array not empty
          setTimeout(function(){
              if(process_syncing_to_wallets_array[socket_id]!=undefined){
              delete process_syncing_to_wallets_array[socket_id];} //guarantee deleting after 5 seconds
              } 
          ,5000);
          
         var result={};
         if(last_rewind==null || last_rewind==undefined){last_rewind={time:0};}
         if(last_rewind.time < ((Date.now()/1000))- (179*24*3600)){ //last sync/rewind older than 180 days --> sync from 0
            result = await get_tx_data_by_addresses(0,list);
            result.from=0;
            result.to=read_block_height-1;
            if(rewind_list!=null && rewind_list.length>0){
            result.last_rewind=rewind_list[rewind_list.length-1];}
            else{
                result.last_rewind={time:(Date.now()/1000),block_height:read_block_height-1};
            }
         } 
         else{
             var new_rewind={time:last_rewind.time,block_height:last_rewind.block_height};
             var found_lower=false;
             for(var i=rewind_list.length-1; i>=0 && rewind_list[i].time>new_rewind.time; i--){               
               if(rewind_list[i].block_height <= from){
                   new_rewind.block_height=rewind_list[i].block_height;
                   found_lower=true;
               }
             }
            result = await get_tx_data_by_addresses((found_lower ? new_rewind.block_height : (from+1)),list);
            result.from=(found_lower ? new_rewind.block_height : (from+1));
            result.to=read_block_height-1;          
            if(rewind_list!=null && rewind_list.length>0){
            result.last_rewind=rewind_list[rewind_list.length-1];}
            else{
                result.last_rewind={time:(Date.now()/1000),block_height:read_block_height-1};
            }
         }
        result.sync_id=sync_id;
        result.alias_prices=alias_prices;
        result.server_donation_address=cnf_donation_address;
        socket.emit("server_respond_sync_data",result);       
        }
        else{
            console.log("not accepted - waiting for server sync");
            socket.emit("server_respond_sync_data",{message:"wait for syncing"});
        }
        //delete to allow server sync again 
        if(process_syncing_to_wallets_array[socket_id]!=undefined){
              delete process_syncing_to_wallets_array[socket_id];}
       
  });
    var last_mempool_string="";
    var mempool_interval= setInterval(async function(){
        
        //global mempool changed?
        if (last_mempool_string != global_mempool_output_list_string) {
            last_mempool_string = global_mempool_output_list_string;

            var mempool_output = [];
            for (var i = 0; i < global_mempool_output_list.length; i++) {
                if (global_mempool_output_list[i].scriptPubKey != undefined && global_mempool_output_list[i].scriptPubKey != null)
                {
//                    console.log(global_mempool_output_list[i].scriptPubKey.addresses);
                    if (global_mempool_output_list[i].scriptPubKey.addresses != undefined && global_mempool_output_list[i].scriptPubKey.addresses != null && global_mempool_output_list[i].scriptPubKey.addresses.length > 0)
                    {
                        for (var j = 0, len = address_list.length; j < len; j++) {
                            if (address_list[j] == global_mempool_output_list[i].scriptPubKey.addresses[0]) {
                                mempool_output.push(global_mempool_output_list[i]);
                            }
                        }
                    }
                }
            }

            if(mempool_output.length>0){
//                console.log("mempool_output:\n",mempool_output);
                socket.emit("server_mempool_txs", {message: mempool_output});              
            }
            
        }
        
        
                       
//        console.log("mempool push @ "+new Date().toLocaleString());
    },1500);
    
    socket.on("disconnect",function(){
        clearInterval(mempool_interval);
        address_list=undefined;
        console.log("client ["+socket_id+"] disconnected");
    });
    
    socket.on("send_raw_tx",function(raw_tx,tx_object){
        console.log("NEW TRANSACTION INCOMING: "+raw_tx);
        request_rpc("sendrawtransaction",raw_tx,"socket_event",socket,tx_object);
    });
});



//functions
/*
 * ***********************************
 */

function request_rpc(method,params,event,socket,socket_data) {
    let  options = {
        url: "http://127.0.0.1:36657",
        method: "post",
        headers:
                {
                    "content-type": "application/json"
                },
        auth: {
            user: username,
            pass: password
        },
        body: JSON.stringify({"jsonrpc": "1.0", "id": (method + "_"), "method": method, "params": (params != null ? (Array.isArray(params) ? params : [params]) : [])})
    };

     request(options, (error, response, body) => {
        if (error) {
            console.error("request method: " + method+" | "+params);
            console.error('An error has occurred: ', error);
            if(socket!=undefined){
                socket.emit("server_respond_send_raw_tx",{message:false});
                return;
            }
            eventEmitter.emit(event,true,error);
            request_error_counter++;
            if(request_error_counter>2){
                process.exit();
            }
        } else { 
            request_error_counter=0;
//            console.log("request method: " + method+" | "+params);
//            console.log('Post successful: body: ', body);
            if(socket!=undefined){
                socket.emit("server_respond_send_raw_tx",{message:body,data:socket_data});
                return;
            }
            eventEmitter.emit(event,false,body);
//          console.log('Post successful: response: ', response);
        }
    });

}

function set_alias_prices() {
    let  options = {
        url: "https://api.coingecko.com/api/v3/simple/price?ids=spectrecoin&vs_currencies=btc%2Ceth%2Cltc%2Cbch%2Cbnb%2Ceos%2Cxrp%2Cxlm%2Clink%2Cdot%2Cyfi%2Cusd%2Caed%2Cars%2Caud%2Cbdt%2Cbhd%2Cbmd%2Cbrl%2Ccad%2Cchf%2Cclp%2Ccny%2Cczk%2Cdkk%2Ceur%2Cgbp%2Chkd%2Chuf%2Cidr%2Cils%2Cinr%2Cjpy%2Ckrw%2Ckwd%2Clkr%2Cmmk%2Cmxn%2Cmyr%2Cngn%2Cnok%2Cnzd%2Cphp%2Cpkr%2Cpln%2Crub%2Csar%2Csek%2Csgd%2Cthb%2Ctry%2Ctwd%2Cuah%2Cvef%2Cvnd%2Czar%2Cxdr%2Cxag%2Cxau%2Cbits%2Csats",
        method: "get",
        headers:
                {
                    "content-type": "application/json"
                }
    };

     request(options, (error, response, body) => {
        if (error) {           
            console.error('An error has occurred: ', error);          
           
        } else { 
            console.log("set alias_prices",body);
            var result=JSON.parse(body);
            if(result.spectrecoin!=null){alias_prices=result.spectrecoin;}
                    
        }
    });

}


var set_current_blockheight= function(error,data){
    
    if(error){
        console.error("can't get current blockheight!");
        return;
    }
    var obj=JSON.parse(data);
//    console.log(obj.result);
    if(current_block_height!=obj.result){
    console.log("set_current_blockheight:"+obj.result);}
    current_block_height=obj.result;
    
    if(process_read_blocks==false && read_block_height<=current_block_height && process_rewind_blocks==false){
        process_read_blocks=true;
        accept_new_syncing_wallet=false;
        request_rpc("getblockbynumber",[read_block_height,true],"getblockbynumber");
    }else if(process_read_blocks==false && read_block_height>current_block_height && process_rewind_blocks==false)
    {accept_new_syncing_wallet=true;}
};
eventEmitter.on('getblockcount', set_current_blockheight);

var read_block = function (error,data){
    if(error){
        console.error("can't read block!");
        console.error(error);
        return;
    }
    var obj=JSON.parse(data);
    if(obj.result.height%100==0){console.log("read block ("+obj.result.height+"):");}   
    write_block(obj.result);


//    console.log(util.inspect(obj.result, {showHidden: false, depth: null}));
//    console.log("++++++++++++++++++++++++++++++++++++++");
//    for(var i=0;i<obj.result.tx.length;i++){
//        console.log("TX--------- "+i);
//         console.log(util.inspect(obj.result.tx[i], {showHidden: false, depth: null}));
//         console.log("***************************************************");
//    }
    
};

var fill_compare = function(error,data){
    if(error){
        console.error("can't read block for orphan scan!");
        console.error(error);
        return;
    }
    var obj=JSON.parse(data);
//    if(obj.result.height%100==0){console.log("read block ("+obj.result.height+"):");}  
    compare_blocks.push({height:obj.result.height,hash:obj.result.hash});
    orphan_read_current++;
    rewind_blocks_check();
}

eventEmitter.on('getblockbynumber', read_block);
eventEmitter.on('fill_compare_blocks', fill_compare);

async function write_block(data){
    //write to DB ....
    //async write_block  (hash,height,time,num_transactions,difficulty,flags)
    var write_result=await alias_database.write_blocks(data.height,data.hash,data.time,data.tx,data.difficulty,data.flags,(read_block_height==current_block_height));
//    console.log(write_result);
   
    //read more if not synced yet
    read_block_height++;
    if(read_block_height<=current_block_height){
        request_rpc("getblockbynumber",[read_block_height,true],"getblockbynumber");}
    else{
               
        process_rewind_blocks=true;  
        process_read_blocks=false;              
        orphan_read_start=current_block_height-50; //only check the last 50 blocks for orphans on every new block to save time -> if the 50ths block back is still orphaned it will rewind in steps of 1000 until equal
        orphan_read_current=orphan_read_start;
        orphan_read_end=current_block_height;
        rewind_blocks_check();                    
    }
    
}

async function rewind_blocks_check(){
    //don't rewind bewlow 0
    if(orphan_read_current<0){      
        compare_blocks=[];
        orphan_read_start= -1;
        orphan_read_current = -1;
        orphan_read_end = -1;
                       
        process_rewind_blocks=false;
        accept_new_syncing_wallet=true;
        
        return;
    }
            
    if(orphan_read_current<=orphan_read_end){
        request_rpc("getblockbynumber",[orphan_read_current,true],"fill_compare_blocks");
    }
    else{
//        console.log("rewind_blocks_check() "+orphan_read_start+" -> "+orphan_read_end);
        var read_list=[];
        for(var i=orphan_read_start;i<=orphan_read_end;i++){
            read_list.push(i);
        }
        
        var rpc_block_list=await get_blockhash_by_blockheight(read_list);
//        console.log(rpc_block_list.length);
        for(var i=0,len=compare_blocks.length;i<len;i++){
            if(compare_blocks[i].hash!=rpc_block_list[i].blockhash)
            {
                if(i==0){  //rewind more 
                    orphan_read_start=orphan_read_start-1000;
                    orphan_read_current=orphan_read_start;
                    orphan_read_end=orphan_read_end-1000;
                    rewind_blocks_check();
                    return;
                    
                }
                else{
                    console.log("FOUND ORPHAN BLOCK --> rewind to "+compare_blocks[i].height);
                    await alias_database.rewind_blocks(compare_blocks[i].height); // delete blocks and add new rewind point
                    rewind_list= await alias_database.get_rewinds(); //update rewind array
                    setTimeout(function(){
                        process_rewind_blocks=false;
                   
                    
                        read_block_height=compare_blocks[i].height;
                    
                        compare_blocks=[];
                        orphan_read_start=-1;
                        orphan_read_current=-1;
                        orphan_read_end=-1;

                        //sync from new start
                        process_read_blocks=true;
                        request_rpc("getblockbynumber",[read_block_height,true],"getblockbynumber");
                    },1501); // --> time of rewind must be a unique utc second
                    
                    return;
                }
            }
        }
        
        //if no more orphans found-->
        compare_blocks=[];
        orphan_read_start= -1;
        orphan_read_current = -1;
        orphan_read_end = -1;
                       
        process_rewind_blocks=false;
        accept_new_syncing_wallet=true;
                              
    }
}

async function get_tx_data_by_addresses(from,list){
    console.log("-------------get_tx_data_by_addresses");
    var result= await alias_database.get_tx_data_by_addresses(from,list);
    return result;
        
}

async function get_blockhash_by_blockheight(list){
    console.log("-------------get_blockhash_by_blockheight");
    var result= await alias_database.get_blockhash_by_blockheight(list);
    return result;
        
}
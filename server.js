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


//Create an event handler:
var mainloop =  async function () {
   //sync
   if(startup){
    startup=false;   
    var db_height=await alias_database.get_current_db_blockheight();
    console.log(db_height);
    if(db_height!=undefined){read_block_height=db_height.blockheight+1; // +1 do not read twice 
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



//**********************************************
//start the server for light wallet

const io = require('socket.io')(3000,{pingTimeout: 20000, pingInterval: 5000});

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
  socket.on('sync_from', async (from,list,last_rewind) =>  {
      address_list=list;
       if(accept_new_syncing_wallet){         
          process_syncing_to_wallets_array[socket_id]=1; //server can not sync while array not empty
          setTimeout(function(){
              if(process_syncing_to_wallets_array[socket_id]!=undefined){
              delete process_syncing_to_wallets_array[socket_id];} //guarantee deleting after 5 seconds
              } 
          ,5000);
          
         var result={}; 
         if(last_rewind < ((Date.now()/1000))- (179*24*3600)){ //last sync/rewind older than 180 days --> sync from 0
            result = await get_tx_data_by_addresses(0,list);
            result.from=0;
            result.to=read_block_height-1;
            result.last_rewind=rewind_list[rewind_list.length-1];
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
            result.last_rewind=rewind_list[rewind_list.length-1];
         }
         
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
  
    var mempool_interval= setInterval(async function(){
        //compare with address_list first
        //...
        for(var i=0,len=address_list.length;i<len;i++){
            //if.....
        }
        var mempool_output=[];
//        console.log("mempool push @ "+new Date().toLocaleString());
    },3000);
    
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
        } else { 
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
        
        process_read_blocks=false;        
        process_rewind_blocks=true;  
        orphan_read_start=current_block_height-1000;
        orphan_read_current=orphan_read_start;
        orphan_read_end=current_block_height;
        rewind_blocks_check();                    
    }
    
}

async function rewind_blocks_check(){
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


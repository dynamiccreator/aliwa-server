class alias_database {
    mariadb = null;
    pool = null;
    block_buffer= [];
    tx_count = 0;

    constructor() {
        this.mariadb = require('mariadb');
        this.pool = this.mariadb.createPool({
            host: 'localhost',
            user: cnf_db_user,
            password: cnf_db_password,
            database: cnf_db_database,
            connectionLimit: 128
        });
    }

    async get_current_db_blockheight() {
        let conn;
        try {
            conn = await this.pool.getConnection();
            
            var rows = await conn.query("SELECT blockheight FROM blocks ORDER BY blockheight DESC LIMIT 1");
            var height= rows[0];                    
            return height;

        } catch (err) {
            console.error(err);           
            throw err;
        } finally {
            if (conn)
//            console.log("connection closed");
            conn.end();
        }
    }

    
    async write_blocks(height, hash, time, tx, difficulty, flags, is_last){
            var prev_hash="";
            if(this.block_buffer.length>0)
            {prev_hash=this.block_buffer[this.block_buffer.length-1].hash;}
            this.block_buffer.push({height:height, hash:hash, time:time, tx:tx, difficulty:difficulty, flags:flags,prev_hash:prev_hash});
            this.tx_count+=tx.length;
            
                        
            if(this.tx_count>=250 || is_last){
                this.tx_count=0;
             var coins_created=[];   
                
                //write to DB
                //
                //WRITE OUTPUTS
                var write_outputs_query="INSERT INTO tx_outputs(tx,num,value,scriptPubKey,to_address,create_height,time,mature,blockhash) VALUES ";//values (?,?,?,?,?,?,?,?)";
                var outputs_values_array=[];
                var has_outputs=false;
                for(var b=0;b<this.block_buffer.length;b++){
                    coins_created[b]=0;
                    var cl_block=this.block_buffer[b]; //current loop block
                    
                    for (var i = 1; i < cl_block.tx.length; i++) { // leave out first tx (coinbase tx)
                        var tx_time=cl_block.tx[i].time;
                //   Coinmaturity (confirmations)450 for stake reward / 10 for ALIAS (private) / 6 for ALIAS (public)  
                    for (var vout_index = 0; vout_index < cl_block.tx[i].vout.length; vout_index++) {

                    coins_created[b] += (cl_block.tx[i].vout[vout_index].value);
//                    console.log("tx[i].vout[vout_index].value number? : "+tx[i].vout[vout_index].value);

                    //public outputs only         
                    //narration
                    if (cl_block.tx[i].vout[vout_index].scriptPubKey.addresses == undefined && cl_block.tx[i].vout[vout_index].value == 0 && cl_block.tx[i].vout[vout_index].scriptPubKey.hex.startsWith("6a026e706a")) {                      
                        //prevent error
                        if(vout_index-1>=0){
                            has_outputs=true;
                            write_outputs_query+="(?,?,?,?,?,?,?,?,?),";                            
                            var mature= (i>1 ? 1 : 0); // 1=normal transaction , 0 = staking reward (6 vs 450 conf. atm)    
                            outputs_values_array.push ( cl_block.tx[i].txid, cl_block.tx[i].vout[vout_index].n, cl_block.tx[i].vout[vout_index].value, cl_block.tx[i].vout[vout_index].scriptPubKey.hex, cl_block.tx[i].vout[vout_index-1].scriptPubKey.addresses[0], cl_block.height,tx_time,mature,cl_block.hash);
//                            console.log(res_outputs);
                        }  
                        
                    }
                    //normal public output
                    else if (cl_block.tx[i].vout[vout_index].scriptPubKey.addresses != undefined) {
                        has_outputs=true;
                        write_outputs_query+="(?,?,?,?,?,?,?,?,?),";                            
                        var mature= (i>1 ? 1 : 0); // 1=normal transaction , 0 = staking reward (6 vs 450 conf. atm)
                        outputs_values_array.push(cl_block.tx[i].txid, cl_block.tx[i].vout[vout_index].n, cl_block.tx[i].vout[vout_index].value, cl_block.tx[i].vout[vout_index].scriptPubKey.hex, cl_block.tx[i].vout[vout_index].scriptPubKey.addresses[0], cl_block.height, tx_time,mature,cl_block.hash);
//                        console.log(res_outputs);
                    }
                    //anon output as anon address
                 /*   else if (cl_block.tx[i].vout[vout_index].scriptPubKey.addresses == undefined && cl_block.tx[i].vout[vout_index].value > 0) {
                        has_outputs=true;               
                        write_outputs_query+="(?,?,?,?,?,?,?,?,?),";                            
                        var mature= (i>1 ? 1 : 0); // 1=normal transaction , 0 = staking reward (6 vs 450 conf. atm) (10 vs 450 for anon)
                        outputs_values_array.push(cl_block.tx[i].txid, cl_block.tx[i].vout[vout_index].n, cl_block.tx[i].vout[vout_index].value, "anon hex", "anon", cl_block.height, cl_block.time,mature,cl_block.hash);
//                        console.log(res_outputs);
                    }*/ //-----disabled, light wallet is public only with no mixed use case possible / endorsed for core 
                }
                
                }
            
            }//END OF WRITE OUPUT QUERY LOOP (blocks)
            write_outputs_query=write_outputs_query.substring(0,write_outputs_query.length-1);
//                console.log(write_outputs_query);
//                console.log(outputs_values_array)
                
            let conn;
            try {
                conn = await this.pool.getConnection();
                await conn.beginTransaction();

                var first_prev_block = await this.private_set_get_prev_block(conn, this.block_buffer[0].height, this.block_buffer[0].hash);

                
                var outstanding = first_prev_block.outstanding;
                var first_prev_blockhash = first_prev_block.blockhash;
                
                //write outputs to DB
                if(has_outputs){
                await conn.query(write_outputs_query,outputs_values_array);}
//                var res_outputs = await conn.query(write_outputs_query,outputs_values_array);
//                console.log(res_outputs);
                
          
//SELECT t.*
//FROM tx_outputs t JOIN
//(SELECT 1 as ord, "aaaaaaa" as tx,2 as num UNION ALL
// SELECT 2 as ord, "bbbbbbb" as tx,1 as num 
//) x
// USING (tx,num)
// ORDER BY x.ord;
                
//SELECT OUTPUTS FROM INPUTS QUERY*********************************                
                var from_output_values_query ="SELECT t.* FROM tx_outputs t JOIN (";
                var from_output_values_query_array =[];
                
                var has_public_output=false;
                
                for (var b = 0; b < this.block_buffer.length; b++) {
                    var cl_block = this.block_buffer[b]; //current loop block

                    for (var i = 1; i < cl_block.tx.length; i++) { // leave out first tx (coinbase tx)
                         var tx_time=cl_block.tx[i].time;
                        for (var vin_index = 0; vin_index < cl_block.tx[i].vin.length; vin_index++) {

                            //public inputs only
                            if (cl_block.tx[i].vin[vin_index].keyimage == undefined) { 
                                has_public_output=true;
                                from_output_values_query+='SELECT 1 as ord, ? as tx,? as num UNION ALL ';
                                from_output_values_query_array.push(cl_block.tx[i].vin[vin_index].txid, cl_block.tx[i].vin[vin_index].vout);                                                                                            
                            } 
                        }
                    }
                }// END OF WRITE GET ALL OUTPUTS FROM INPUTS QUERY
                from_output_values_query= from_output_values_query.substring(0,from_output_values_query.length-10)
                        +") x USING (tx,num) ORDER BY x.ord;";
//                console.log(from_output_values_query);
                if(has_public_output){
                    var res_from_outputs_values = await conn.query(from_output_values_query,from_output_values_query_array);
                }
//                console.log(res_from_outputs_values);


//WRITE INPUTS QUERY AND BLOCKS QUERY************************
                   var write_inputs_query="INSERT INTO tx_inputs(tx,in_index,from_tx,from_vout,create_height,time,blockhash) VALUES ";
                   var write_inputs_array=[]; 
                   
                   var write_blocks_query="INSERT INTO blocks (blockheight,blockhash,prev_blockhash,next_blockhash,time,num_transactions,difficulty,flags,coins_created,outstanding) VALUES ";
                   var write_blocks_array=[]; 
                   
                   var found_matching_outputs=false;
                    

                    for (var b = 0; b < this.block_buffer.length; b++) {
                    var cl_block = this.block_buffer[b]; //current loop block

                    for (var i = 1; i < cl_block.tx.length; i++) { // leave out first tx (coinbase tx)
                        var tx_time=cl_block.tx[i].time;
                        for (var vin_index = 0; vin_index < cl_block.tx[i].vin.length; vin_index++) {

                            //public inputs only
                            if (cl_block.tx[i].vin[vin_index].keyimage == undefined) {
                                var from_output_values =  this.find_matching_outputs(res_from_outputs_values, cl_block.tx[i].vin[vin_index].txid, cl_block.tx[i].vin[vin_index].vout);
                    
                                if (from_output_values != null) {
                                    found_matching_outputs=true;
                                    coins_created[b] -= (from_output_values.value);
//                             console.log("from_output_values.value number? : "+from_output_values.value);
                                
                                    write_inputs_query+="(?,?,?,?,?,?,?),";
                                    write_inputs_array.push(cl_block.tx[i].txid, vin_index, from_output_values.tx, from_output_values.num, cl_block.height,tx_time,cl_block.hash);
//                            console.log(res_inputs);
                                }
                            } else {
                                coins_created[b] -= (cl_block.tx[i].vin[vin_index].value);
//                        console.log("(tx[i].vin[vin_index].value) number? : "+(tx[i].vin[vin_index].value));
                            }
                        }
                    }
                    //block:
                    outstanding+=coins_created[b];
                    write_blocks_query+="(?,?,?,?,?,?,?,?,?,?),";
                    if(b==0){
                     write_blocks_array.push(cl_block.height, cl_block.hash, first_prev_blockhash, ((b+1<this.block_buffer.length) ? this.block_buffer[b+1].hash : ""), cl_block.time, cl_block.tx.length, cl_block.difficulty, cl_block.flags, coins_created[b], outstanding);
                    }
                    else{
                        write_blocks_array.push(cl_block.height, cl_block.hash, cl_block.prev_hash, ((b+1<this.block_buffer.length) ? this.block_buffer[b+1].hash : ""), cl_block.time, cl_block.tx.length, cl_block.difficulty, cl_block.flags, coins_created[b], outstanding);
                    }
                    
                    
                    
                }//END OF WRITE INPUTS QUERY
                
                write_inputs_query=write_inputs_query.substring(0,write_inputs_query.length-1);
                write_blocks_query=write_blocks_query.substring(0,write_blocks_query.length-1);
//                
//                console.log(write_inputs_query);
//                console.log(write_blocks_query);
//                console.log(write_blocks_array);
                
                if(found_matching_outputs){await conn.query(write_inputs_query,write_inputs_array);
//                    console.log("inputs written between "+this.block_buffer[0].height+" and +x");
                }
                await conn.query(write_blocks_query,write_blocks_array);
                
                           
//                console.log("write from height: "+this.block_buffer[0].height);
                
                await conn.commit();
                this.block_buffer=[];
            } catch (err) {
                console.error(err);
                await conn.rollback();
                process.exit();
                throw err;
            } finally {
                if (conn){
//                console.log("connection closed 246");                  
                  conn.end();
              }
              //            return sync_height
            }   
                
            
            /*END OF IF tx>1000*******************/           
            }
    }


    async private_set_get_prev_block(conn, height, hash) {
        var rows = await conn.query("SELECT blockhash,outstanding FROM blocks WHERE blockheight=?", [(height - 1)]);
        if (rows.length > 0) { // if exists
//            console.log("set next blockhash");
            await conn.query("UPDATE blocks SET next_blockhash=? WHERE blockheight=?", [hash, (height - 1)]);
//            console.log(rows[0]);
            return rows[0];
        }
        return {blockhash: "", outstanding: 0};
    }

    
    find_matching_outputs(arr,tx,num){
        for(var i=0;i<arr.length;i++){
            if(arr[i].tx==tx && arr[i].num==num){
                return arr[i];
            }
        }
        return null;
    }
    
    async get_tx_data_by_addresses(from, list) {
        var outputs=[]; // mixed* outputs
        var inputs=[]; //mixed* inputs
        var found=false;
        var query_count=0;
       
        //* mixed here means that the array includes also inputs/outputs which do not belong to the address list but are from belonging transactions
        let conn;
        try {
            conn = await this.pool.getConnection();
            //outputs
            var select_outputs_query="SELECT * FROM tx_outputs WHERE tx IN (SELECT tx FROM tx_outputs WHERE to_address IN (";
            var select_outputs_array=[];
            
            for(var i=0;i<list.length;i++){
                found=true
                select_outputs_query+="?,";
                select_outputs_array.push(list[i]);
            }
            select_outputs_query=select_outputs_query.substring(0,select_outputs_query.length-1)+"));"; // no create_height here , because ALL outputs must be checked for being spend
//            select_outputs_array.push(from);
                      
              if(found){
              query_count++;    
              outputs= await conn.query(select_outputs_query,select_outputs_array);}
              found=false;
            
            //inputs
//            + OR IN tx IN (...)!!!!!!

            
                
            var select_inputs_query="SELECT * FROM tx_inputs WHERE (tx IN (";
            var select_inputs_array=[];
            for(var i=0;i<outputs.length;i++){
                found=true;
                select_inputs_query+="?,";
                select_inputs_array.push(outputs[i].tx);
            }
            select_inputs_query=select_inputs_query.substring(0,select_inputs_query.length-1)+") OR tx IN (SELECT tx FROM tx_inputs WHERE from_tx IN (";
            
            for(var i=0;i<outputs.length;i++){               
                select_inputs_query+="?,";
                select_inputs_array.push(outputs[i].tx);
            }
                                
            select_inputs_query=select_inputs_query.substring(0,select_inputs_query.length-1)+"))) AND create_height>=?;";
            select_inputs_array.push(from);
            
            if(found){
            query_count++;
            inputs= await conn.query(select_inputs_query,select_inputs_array);}
            found=false;
                    
            
            //outputs_extern
           var select_outputs_extern_query="SELECT * FROM tx_outputs WHERE tx IN (";
            var select_outputs_extern_array=[];
            for(var i=0;i<inputs.length;i++){
                found=true;
                select_outputs_extern_query+="?,";
                select_outputs_extern_array.push(inputs[i].tx);
                select_outputs_extern_query+="?,";
                select_outputs_extern_array.push(inputs[i].from_tx);
            }
            
            select_outputs_extern_query=select_outputs_extern_query.substring(0,select_outputs_extern_query.length-1)+") OR tx IN (SELECT tx FROM tx_outputs WHERE to_address IN (";
            
            for(var i=0;i<list.length;i++){               
                select_outputs_extern_query+="?,";
                select_outputs_extern_array.push(list[i]);
            }
                   
            select_outputs_extern_query=select_outputs_extern_query.substring(0,select_outputs_extern_query.length-1)+")) AND create_height>=?;";
            select_outputs_extern_array.push(from);
            
            
            if(found){
            query_count++;
            var outputs_extern= await conn.query(select_outputs_extern_query,select_outputs_extern_array);
            outputs=outputs_extern;}
            found=false;
              
            //inputs extern
            var select_inputs_extern_query="SELECT * FROM tx_inputs WHERE (tx IN (";
            var select_inputs_extern_array=[];
            for(var i=0;i<outputs.length;i++){
                found=true;
                select_inputs_extern_query+="?,";
                select_inputs_extern_array.push(outputs[i].tx);
            }
            select_inputs_extern_query=select_inputs_extern_query.substring(0,select_inputs_extern_query.length-1)+") OR tx IN (SELECT tx FROM tx_inputs WHERE from_tx IN (";
            
            for(var i=0;i<outputs.length;i++){
                select_inputs_extern_query+="?,";
                select_inputs_extern_array.push(outputs[i].tx);
            }
                                
            select_inputs_extern_query=select_inputs_extern_query.substring(0,select_inputs_extern_query.length-1)+"))) AND create_height>=?;";
            select_inputs_extern_array.push(from);
                               
            if(found){
            query_count++;    
            var inputs_extern= await conn.query(select_inputs_extern_query,select_inputs_extern_array);          
            inputs=inputs_extern;
            }
            
            //remove meta
            inputs = inputs.filter(item => item !== "meta");
            outputs = outputs.filter(item => item !== "meta");
            
            //remove outputs greater than height        
            for(var i=outputs.length-1;i>=0;i--){ //reverse order to not mess up indices
                if(outputs[i].create_height<from){
                   outputs.splice(i,1);
                }
            }
              
            console.log("query_count: "+query_count);
           
        
        } catch (err) {
            console.error(err);
            
           // process.exit();
            throw err;
        } finally {
            if (conn)
//                console.log("connection closed");
                conn.end();
                return {outputs:outputs,inputs:inputs};
        }
    }
    
    async get_blockhash_by_blockheight(list) {
        var output=[];
        let conn;
        try {
            conn = await this.pool.getConnection();
            //outputs
            var select_outputs_query="SELECT blockheight,blockhash FROM blocks WHERE blockheight IN (";
            var select_outputs_array=[];
            
            for(var i=0;i<list.length;i++){
                
                select_outputs_query+="?,";
                select_outputs_array.push(list[i]);
            }
            select_outputs_query=select_outputs_query.substring(0,select_outputs_query.length-1)+") ORDER by blockheight ASC;";
            
            output= await conn.query(select_outputs_query,select_outputs_array);
                       
        } catch (err) {
            console.error(err);
            
           // process.exit();
            throw err;
        } finally {
            if (conn){conn.end();}
//                console.log("connection closed");
            return output;
        }
    }
    
    async rewind_blocks(height){
        let conn;
        try {          
            conn = await this.pool.getConnection();
            await conn.beginTransaction();
            
            await conn.query("DELETE FROM tx_inputs WHERE create_height>=?", [height]);
            await conn.query("DELETE FROM tx_outputs WHERE create_height>=?", [height]);
            await conn.query("DELETE FROM blocks WHERE blockheight>=?", [height]);
           
            var select_outputs_query = "INSERT INTO rewinds (time,block_height) VALUES ((SELECT UNIX_TIMESTAMP()),?)";
            var select_outputs_array = [height];

            await conn.query(select_outputs_query, select_outputs_array);
            await conn.commit();

        } catch (err) {
            console.error(err);
            await conn.rollback();
            process.exit();
            throw err;
        } finally {
            if (conn)
//                console.log("connection closed");
                conn.end();           
        }
    }
    
     async get_rewinds() {
        var result=[];
        let conn;
        try {
            conn = await this.pool.getConnection();
                 
            result= await conn.query("SELECT time,block_height FROM rewinds WHERE time>(SELECT UNIX_TIMESTAMP() - (180*24*3600)) ORDER by time ASC"); // only get rewinds from last 180 days
                       
        } catch (err) {
            console.error(err);
            
           // process.exit();
            throw err;
        } finally {
            if (conn){conn.end();}
//                console.log("connection closed");
            return result;
        }
    }
    

}

exports.alias_database = alias_database;
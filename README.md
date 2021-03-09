# aliwa-server
A node.js server for the aliwa wallet

# Documentation (linux)

1.Have an Alias wallet (gui/rpc) fully synced (wallet from https://alias.cash)

2.Modify rpcuser and rpcpassword in the alias.conf file

3.copy alias.conf file into .aliaswallet folder


4.(optional) test curl functionality with: curl --data-binary '{"jsonrpc": "1.0", "id":"curltest", "method": "getblockcount", "params":[] }' -H 'content-type: text/plain;' http://user:password@127.0.0.1:36657/ (adapt user and password ;) )

5.install mariadb or -->6.

6.(optional) install LAMP (Linux Apache Maria PHP) with phpmyadmin

7.add a mariadb database with user and password

8.import aliwa_server.sql to the database

9.modify main_server.js:

  let username= 
  
  let password= 
  
  var read_block_height= //(0 for sync from 0, or higher value for testing)

10.modify database.js

  user: 'user',
  
  password: 'password',
  
  database: 'aliwa_server',
  
11. install node.js (v>=12)  

12. run: npm install in this folder

13. run: node main_sever.js

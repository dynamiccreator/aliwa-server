# aliwa-server
A node.js server for the aliwa wallet

## Documentation (linux)

### Requirements

* Alias wallet (gui or rpc) fully synced (wallet from https://alias.cash or https://github.com/aliascash/alias-wallet)

* Node.js >=12.0.0

* Maria DB

* (optional) LAMP with phpmyadmin or another gui tool for look up or managing the database conviently if neccessary


### Steps

1.Modify rpcuser and rpcpassword in the alias.conf file

2.Copy alias.conf file into .aliaswallet folder and restart the wallet afterwards

3.(optional) test it with curl: `curl --data-binary '{"jsonrpc": "1.0", "id":"curltest", "method": "getblockcount", "params":[] }' -H 'content-type: text/plain;' http://user:password@127.0.0.1:36657/` (adapt user and password ;) )

4.Add a mariadb database with user and password

5.Import aliwa_server.sql to the database

6.Modify config.js (user,password etc.)

9.`npm install` (in this folder)

10.`node server.js` (in this folder)

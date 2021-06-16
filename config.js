module.exports = function () {
    //alias.cnf
    cnf_host = "localhost";
    cnf_port = "36657";
    cnf_username = "";
    cnf_password = "";
    cnf_read_block_height = 1700000; //(0 for sync from block 0 or a higher value for quick testing)

    //Maria DB
    cnf_db_host = "localhost";
    cnf_db_user = "";
    cnf_db_password = "";
    cnf_db_database = "";

    //load prices from coingecko
    cnf_get_alias_prices = true;
    //define a donation address shown in user's wallet
    cnf_donation_address = "server donation address";
};



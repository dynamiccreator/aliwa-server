-- phpMyAdmin SQL Dump
-- version 4.9.5deb2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Erstellungszeit: 09. Mrz 2021 um 11:11
-- Server-Version: 10.3.25-MariaDB-0ubuntu0.20.04.1
-- PHP-Version: 7.4.3

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `alias_light_pub_chain`
--

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `blocks`
--

CREATE TABLE `blocks` (
  `blockheight` int(10) UNSIGNED NOT NULL,
  `blockhash` char(64) NOT NULL,
  `prev_blockhash` char(64) NOT NULL,
  `next_blockhash` char(64) NOT NULL,
  `time` bigint(20) NOT NULL,
  `num_transactions` int(11) UNSIGNED NOT NULL,
  `difficulty` double NOT NULL,
  `flags` char(60) NOT NULL,
  `coins_created` decimal(18,8) NOT NULL,
  `outstanding` decimal(18,8) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `rewinds`
--

CREATE TABLE `rewinds` (
  `time` bigint(20) NOT NULL,
  `block_height` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `tx_inputs`
--

CREATE TABLE `tx_inputs` (
  `tx` char(64) NOT NULL,
  `in_index` int(11) UNSIGNED NOT NULL,
  `from_tx` char(64) NOT NULL,
  `from_vout` int(10) UNSIGNED NOT NULL,
  `create_height` int(10) UNSIGNED NOT NULL,
  `time` bigint(20) NOT NULL,
  `blockhash` char(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `tx_outputs`
--

CREATE TABLE `tx_outputs` (
  `tx` char(64) NOT NULL,
  `num` int(11) UNSIGNED NOT NULL,
  `value` decimal(18,8) UNSIGNED NOT NULL,
  `scriptPubKey` char(70) NOT NULL,
  `to_address` char(34) NOT NULL,
  `create_height` int(11) UNSIGNED NOT NULL,
  `time` bigint(20) NOT NULL,
  `mature` int(10) UNSIGNED NOT NULL COMMENT '6 for public / 450 for staking',
  `blockhash` char(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `blocks`
--
ALTER TABLE `blocks`
  ADD PRIMARY KEY (`blockheight`),
  ADD UNIQUE KEY `blockhash` (`blockhash`);

--
-- Indizes für die Tabelle `rewinds`
--
ALTER TABLE `rewinds`
  ADD PRIMARY KEY (`time`);

--
-- Indizes für die Tabelle `tx_inputs`
--
ALTER TABLE `tx_inputs`
  ADD PRIMARY KEY (`tx`,`in_index`),
  ADD KEY `create_height` (`create_height`),
  ADD KEY `from_tx` (`from_tx`);

--
-- Indizes für die Tabelle `tx_outputs`
--
ALTER TABLE `tx_outputs`
  ADD PRIMARY KEY (`tx`,`num`),
  ADD KEY `address` (`to_address`),
  ADD KEY `height_created` (`create_height`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
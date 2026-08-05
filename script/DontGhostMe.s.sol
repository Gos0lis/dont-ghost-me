// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {DontGhostMe} from "../src/DontGhostMe.sol";

/// @title DontGhostMe deployment script
/// @notice Deploys the escrow + rescue bounty MVP. The broadcaster becomes `protocolAdmin`.
///
/// Local anvil:
///   anvil
///   forge script script/DontGhostMe.s.sol:DontGhostMeScript --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Remote (Monad or other):
///   forge script script/DontGhostMe.s.sol:DontGhostMeScript \
///     --rpc-url $MONAD_RPC_URL \
///     --broadcast \
///     --private-key $PRIVATE_KEY
///
/// Optional verify (when explorer API is configured):
///   forge verify-contract <ADDRESS> src/DontGhostMe.sol:DontGhostMe --chain <chain-id>
contract DontGhostMeScript is Script {
    DontGhostMe public dontGhostMe;

    function run() public returns (DontGhostMe deployed) {
        vm.startBroadcast();

        dontGhostMe = new DontGhostMe();
        deployed = dontGhostMe;

        vm.stopBroadcast();

        console2.log("DontGhostMe deployed at:", address(dontGhostMe));
        console2.log("protocolAdmin:", dontGhostMe.protocolAdmin());
        console2.log("nextProjectId:", dontGhostMe.nextProjectId());
        console2.log("nextBountyId:", dontGhostMe.nextBountyId());
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/CallRegistry.sol";
import "../src/OutcomeManager.sol";
import "../src/Paymaster.sol";
import "../src/MockToken.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        CallRegistry registry = new CallRegistry();
        OutcomeManager outcomeManager = new OutcomeManager(address(registry));
        Paymaster paymaster = new Paymaster();
        MockToken mockToken = new MockToken();

        console.log("CallRegistry deployed at:", address(registry));
        console.log("OutcomeManager deployed at:", address(outcomeManager));
        console.log("Paymaster deployed at:", address(paymaster));
        console.log("MockToken deployed at:", address(mockToken));

        vm.stopBroadcast();
    }
}

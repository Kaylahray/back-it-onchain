export const CallRegistryABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_stakeToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_stakeAmount",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_endTs",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "_tokenAddress",
                "type": "address"
            },
            {
                "internalType": "bytes32",
                "name": "_pairId",
                "type": "bytes32"
            },
            {
                "internalType": "string",
                "name": "_ipfsCID",
                "type": "string"
            }
        ],
        "name": "createCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_callId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_amount",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "_position",
                "type": "bool"
            }
        ],
        "name": "stakeOnCall",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "name": "calls",
        "outputs": [
            {
                "internalType": "address",
                "name": "creator",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "stakeToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "totalStakeYes",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "totalStakeNo",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "startTs",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "endTs",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
            },
            {
                "internalType": "bytes32",
                "name": "pairId",
                "type": "bytes32"
            },
            {
                "internalType": "string",
                "name": "ipfsCID",
                "type": "string"
            },
            {
                "internalType": "bool",
                "name": "settled",
                "type": "bool"
            },
            {
                "internalType": "bool",
                "name": "outcome",
                "type": "bool"
            },
            {
                "internalType": "uint256",
                "name": "finalPrice",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const ERC20ABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

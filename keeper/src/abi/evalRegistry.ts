// Auto-generated from contracts/out/EvalRegistry.sol — do not edit by hand.
export const evalRegistryAbi = [
  {
    "type": "function",
    "name": "exists",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEval",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct EvalRegistry.Eval",
        "components": [
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "version",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "evaluatorCodeHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "trustTier",
            "type": "uint8",
            "internalType": "enum EvalRegistry.TrustTier"
          },
          {
            "name": "threshold",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "schemaHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "author",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "register",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "evaluatorCodeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "trustTier",
        "type": "uint8",
        "internalType": "enum EvalRegistry.TrustTier"
      },
      {
        "name": "threshold",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "schemaHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "thresholdOf",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EvalRegistered",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "evaluatorCodeHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "threshold",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "author",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadThreshold",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EvalExists",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownEval",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnsupportedTier",
    "inputs": []
  }
] as const;

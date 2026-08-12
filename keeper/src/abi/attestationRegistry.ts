// Auto-generated from contracts/out/AttestationRegistry.sol — do not edit by hand.
export const attestationRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_evalRegistry",
        "type": "address",
        "internalType": "contract EvalRegistry"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "attest",
    "inputs": [
      {
        "name": "evalId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "version",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "deliverableHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "inputHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "score",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "attId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "attestationExists",
    "inputs": [
      {
        "name": "attId",
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
    "name": "count",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "evalRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract EvalRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAttestation",
    "inputs": [
      {
        "name": "attId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AttestationRegistry.Attestation",
        "components": [
          {
            "name": "evalId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "version",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "deliverableHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "inputHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "score",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "evidenceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "evaluator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
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
    "type": "event",
    "name": "Attested",
    "inputs": [
      {
        "name": "attId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "evaluator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "evalId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "deliverableHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "score",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadScore",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownAttestation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownEval",
    "inputs": []
  }
] as const;

# Back It (Onchain)

**Back It (Onchain)** is a multi-chain social prediction market platform built on **Base** and **Stellar**. It allows users to create "calls" (predictions), back them with onchain stakes, and build a reputation based on accuracy.

## 🚀 Features

-   **Create Calls**: Make bold predictions about crypto, culture, or tech.
-   **Back & Counter**: Stake on "YES" or "NO" outcomes.
-   **Social Feed**:
    -   **For You**: Algorithmic feed of trending calls.
    -   **Following**: See calls from users you follow.
-   **User Profiles**: Track your reputation, follower counts, and betting history.
-   **Onchain Accountability**: All stakes and outcomes are recorded onchain.
-   **Multi-Chain Support**: Deploy and interact on Base (EVM) or Stellar (Soroban).

## 🔗 Supported Chains

| Chain | Status | Token | Wallet |
|-------|--------|-------|--------|
| **Base** (Ethereum L2) | ✅ Production | USDC (ERC-20) | Coinbase Wallet, MetaMask |
| **Stellar** (Soroban) | 🚧 In Development | USDC (Stellar Native) | Freighter, Lobstr |

## 🛠 Tech Stack

### Frontend
-   **Framework**: Next.js (App Router)
-   **Styling**: Tailwind CSS
-   **Base Integration**: OnchainKit, Wagmi, viem
-   **Stellar Integration**: @stellar/stellar-sdk, @stellar/freighter-api

### Backend
-   **Framework**: NestJS
-   **Database**: PostgreSQL + TypeORM
-   **Indexing**: Multi-chain event indexer (ethers.js + Stellar Horizon)

### Smart Contracts
| Chain | Language | Framework |
|-------|----------|-----------|
| Base | Solidity | Foundry |
| Stellar | Rust | Soroban SDK |

### Oracle
-   **Base**: EIP-712 typed data signatures (secp256k1)
-   **Stellar**: ed25519 signatures

## 📦 Project Structure

```
back-it-onchain/
├── packages/
│   ├── frontend/          # Next.js web application
│   ├── backend/           # NestJS API server
│   ├── contracts/         # Solidity contracts (Base)
│   └── contracts-stellar/ # Soroban contracts (Stellar)
├── ARCHITECTURE.md        # Detailed system design
├── APP-CONCEPT.md         # Product vision
└── README.md
```

### Package Details

| Package | Description |
|---------|-------------|
| `packages/frontend` | Next.js app with multi-chain wallet support |
| `packages/backend` | Unified API server, multi-chain indexer, oracle service |
| `packages/contracts` | Solidity smart contracts for Base (Foundry) |
| `packages/contracts-stellar` | Rust smart contracts for Stellar (Soroban) |

## 🏃‍♂️ Getting Started

### Prerequisites

-   Node.js (v18+)
-   pnpm (v8+)
-   Docker (for PostgreSQL)
-   Foundry (for Base contracts)
-   Rust + soroban-cli (for Stellar contracts)

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/yourusername/back-it-onchain.git
    cd back-it-onchain
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

3.  **Setup Environment Variables**
    -   Copy `.env.example` to `.env` in `packages/backend` and `packages/contracts`.
    -   Copy `.env.local.example` to `.env.local` in `packages/frontend`.

4.  **Start Development**
    ```bash
    pnpm dev
    ```
    This starts both frontend and backend concurrently using Turborepo:
    -   **Frontend**: http://localhost:3000
    -   **Backend**: http://localhost:3001

### Chain-Specific Setup

#### Base (EVM)
```bash
cd packages/contracts
forge build
forge test
```

#### Stellar (Soroban)
```bash
cd packages/contracts-stellar
soroban contract build
soroban contract test
```

## 🌐 Multi-Chain Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────────┐          ┌─────────────────┐           │
│  │  Base Wallet    │          │  Stellar Wallet │           │
│  │  (Wagmi/OCK)    │          │  (Freighter)    │           │
│  └────────┬────────┘          └────────┬────────┘           │
└───────────┼────────────────────────────┼────────────────────┘
            │                            │
            ▼                            ▼
┌───────────────────────┐    ┌───────────────────────┐
│   Base Contracts      │    │  Stellar Contracts    │
│   (Solidity)          │    │  (Soroban/Rust)       │
│   - CallRegistry      │    │  - call_registry      │
│   - OutcomeManager    │    │  - outcome_manager    │
└───────────┬───────────┘    └───────────┬───────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Unified Backend                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Indexer    │  │   Oracle    │  │    Feed     │          │
│  │ (Multi-Chain) │  │  Service   │  │   Service   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                          │                                   │
│                    ┌─────┴─────┐                            │
│                    │ PostgreSQL │                            │
│                    └───────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Oracle Design

The oracle service supports both chains with different signature schemes:

| Chain | Signature Scheme | Verification |
|-------|------------------|--------------|
| Base | EIP-712 (secp256k1) | `ecrecover` in Solidity |
| Stellar | ed25519 | `env.crypto().ed25519_verify()` in Soroban |

## 📖 Documentation

-   [Architecture](./ARCHITECTURE.md) - Detailed system design
-   [App Concept](./APP-CONCEPT.md) - Product vision and principles

## 🛣 Roadmap

- [x] Base deployment (MVP)
- [x] Social graph and feed
- [ ] Stellar Soroban contracts
- [ ] Multi-chain wallet selector
- [ ] Cross-chain reputation aggregation
- [ ] Mainnet deployments

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a PR.

## 📜 License

MIT

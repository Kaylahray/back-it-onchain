import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { Keypair } from '@stellar/stellar-sdk';

@Injectable()
export class OracleService {
  private signer: ethers.Wallet;
  private stellarKeypair: Keypair;

  constructor(private configService: ConfigService) {
    const privateKey = this.configService.get<string>('ORACLE_PRIVATE_KEY');
    if (privateKey) {
      this.signer = new ethers.Wallet(privateKey);
    }

    // Initialize Stellar keypair for ed25519 signing
    const stellarSecretKey = this.configService.get<string>(
      'STELLAR_ORACLE_SECRET_KEY',
    );
    if (stellarSecretKey) {
      this.stellarKeypair = Keypair.fromSecret(stellarSecretKey);
    }
  }

  /**
   * Get the Stellar public key for contract authorization
   */
  getStellarPublicKey(): string {
    if (!this.stellarKeypair) {
      throw new Error('Stellar keypair not configured');
    }
    return this.stellarKeypair.publicKey();
  }

  async fetchPrice(tokenAddress: string): Promise<number> {
    // Placeholder for DexScreener API call
    console.log(`Fetching price for ${tokenAddress}`);
    // const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    // return response.data.pairs[0].priceUsd;
    return Promise.resolve(1000); // Mock price
  }

  async signOutcome(
    callId: number,
    outcome: boolean,
    finalPrice: number,
    timestamp: number,
  ) {
    if (!this.signer) throw new Error('Oracle signer not configured');

    const domain = {
      name: 'OnChainSageOutcome',
      version: '1',
      chainId: 84532, // Base Sepolia
      verifyingContract: this.configService.get<string>(
        'OUTCOME_MANAGER_ADDRESS',
      ),
    };

    const types = {
      Outcome: [
        { name: 'callId', type: 'uint256' },
        { name: 'outcome', type: 'bool' },
        { name: 'finalPrice', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
      ],
    };

    const value = {
      callId,
      outcome,
      finalPrice,
      timestamp,
    };

    return this.signer.signTypedData(domain, types, value);
  }

  /**
   * Sign outcome with ed25519 for Stellar/Soroban verification
   *
   * Message format: BackIt:Outcome:{callId}:{outcome}:{finalPrice}:{timestamp}
   * - callId: The unique identifier for the call
   * - outcome: 'true' or 'false' (as string)
   * - finalPrice: The final price as a number
   * - timestamp: Unix timestamp in seconds
   *
   * @param callId - Unique call identifier
   * @param outcome - Whether the outcome was successful
   * @param finalPrice - Final price value
   * @param timestamp - Unix timestamp when the outcome was determined
   * @returns Buffer containing 64-byte ed25519 signature (compatible with BytesN<64>)
   */
  signStellarOutcome(
    callId: number,
    outcome: boolean,
    finalPrice: number,
    timestamp: number,
  ): Buffer {
    if (!this.stellarKeypair) {
      throw new Error('Stellar keypair not configured');
    }

    // Construct canonical message format
    // Must match exactly what the Soroban contract expects
    const message = `BackIt:Outcome:${callId}:${outcome}:${finalPrice}:${timestamp}`;
    const messageBuffer = Buffer.from(message, 'utf-8');

    // Sign with ed25519
    const signature = this.stellarKeypair.sign(messageBuffer);

    return signature;
  }

  /**
   * Sign outcome based on chain type
   * Automatically detects whether to use EIP-712 (EVM) or ed25519 (Stellar) signing
   *
   * @param chain - The blockchain network ('base' or 'stellar')
   * @param callId - Unique call identifier
   * @param outcome - Whether the outcome was successful
   * @param finalPrice - Final price value
   * @param timestamp - Unix timestamp when the outcome was determined
   * @returns Signature string (hex for EVM, base64 for Stellar)
   */
  async signOutcomeForChain(
    chain: 'base' | 'stellar',
    callId: number,
    outcome: boolean,
    finalPrice: number,
    timestamp: number,
  ): Promise<string> {
    if (chain === 'stellar') {
      const signature = this.signStellarOutcome(
        callId,
        outcome,
        finalPrice,
        timestamp,
      );
      // Convert to base64 for storage/transmission
      return signature.toString('base64');
    } else {
      // Use EIP-712 signing for EVM chains (Base)
      return this.signOutcome(callId, outcome, finalPrice, timestamp);
    }
  }
}

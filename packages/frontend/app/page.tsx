import Link from "next/link";
import { TrendingUp, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { ChainSelector } from "@/components/ChainSelector";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import MarketTicker from "@/components/MarketTicker";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <ChainSelector />
            <Link
              href="/feed"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Explore
            </Link>
            <WalletConnectButton />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 md:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background z-0" />

          <div className="container mx-auto px-4 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-border mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs font-medium text-muted-foreground">
                Live on Base Sepolia
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-4 leading-tight">
              Predict the Future.
              <br />
              Back It Onchain.
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              The social prediction layer for Stellar and Base.
            </p>

            <div className="mb-8">
              <MarketTicker />
            </div>

            <div className="flex items-center justify-center">
              <div className="w-full sm:w-auto [&>button]:w-full [&>button]:px-8 [&>button]:py-4 [&>button]:rounded-xl [&>button]:font-semibold [&>button]:text-lg [&>button]:shadow-xl [&>button]:transition-transform [&>button]:hover:-translate-y-0.5">
                <WalletConnectButton />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 border-t border-border/40 bg-secondary/20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard
                icon={<TrendingUp className="h-8 w-8 text-primary" />}
                title="Create Calls"
                description="Predict price movement by creating calls with target prices and timeframes."
              />
              <FeatureCard
                icon={<ShieldCheck className="h-8 w-8 text-accent" />}
                title="Stake Reputation"
                description="Back other users' calls to build reputation and signal conviction."
              />
              <FeatureCard
                icon={<Users className="h-8 w-8 text-blue-500" />}
                title="Earn Rewards"
                description="Win rewards when your predictions are correct — reputation and payouts."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 bg-card">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="default" />
          <p className="text-sm text-muted-foreground">
            © 2025 BackIT Protocol. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-colors group">
      <div className="mb-4 p-3 rounded-xl bg-secondary w-fit group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
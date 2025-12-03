import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Fuel, 
  Building2, 
  FileSpreadsheet, 
  CheckCircle2, 
  BarChart3,
  Shield,
  Zap,
  TrendingUp
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fuel className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold">Pieter's Pomp Stasie Reconner</h1>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Sign in with Google</a>
          </Button>
        </div>
      </header>

      <main>
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-4xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Fuel Station Transaction Reconciliation
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Automatically match your fuel management system transactions with bank statements. 
              Save hours of manual work and catch discrepancies instantly.
            </p>
            <Button size="lg" asChild data-testid="button-get-started">
              <a href="/api/login">Get Started - Sign in with Google</a>
            </Button>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted/50">
          <div className="container mx-auto">
            <h3 className="text-2xl font-bold text-center mb-12">How It Works</h3>
            <div className="grid md:grid-cols-4 gap-6">
              <Card className="hover-elevate">
                <CardHeader>
                  <FileSpreadsheet className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-lg">1. Upload Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Upload your fuel system reports and bank statements (CSV, Excel, or PDF)
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <Zap className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-lg">2. Map Columns</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Our smart system auto-detects columns. Just verify and adjust if needed.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <CheckCircle2 className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-lg">3. Auto-Match</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Intelligent matching groups invoices and finds corresponding bank deposits
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <BarChart3 className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-lg">4. Review & Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Get detailed reports showing matched transactions and discrepancies
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-4">
          <div className="container mx-auto">
            <h3 className="text-2xl font-bold text-center mb-12">Key Features</h3>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">80%+ Match Rate</h4>
                  <p className="text-sm text-muted-foreground">
                    Smart invoice grouping dramatically improves matching accuracy
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Multiple Bank Support</h4>
                  <p className="text-sm text-muted-foreground">
                    FNB, ABSA, and other South African merchant portals supported
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Secure & Private</h4>
                  <p className="text-sm text-muted-foreground">
                    Your financial data is encrypted and never shared
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-primary text-primary-foreground">
          <div className="container mx-auto text-center">
            <h3 className="text-2xl font-bold mb-4">Ready to simplify your reconciliation?</h3>
            <p className="text-primary-foreground/80 mb-6">
              Sign in with your Google account to get started - it's free!
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              asChild
              data-testid="button-cta-login"
            >
              <a href="/api/login">Sign in with Google</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>Pieter's Pomp Stasie Reconner - Fuel Station Reconciliation Made Easy</p>
          <p className="mt-2">Designed for South African fuel station owners and accountants</p>
        </div>
      </footer>
    </div>
  );
}

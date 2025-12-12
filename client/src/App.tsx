import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import CreatePeriod from "@/pages/CreatePeriod";
import ReportView from "@/pages/ReportView";
import Admin from "@/pages/Admin";
import ReconciliationSetupWizard from "@/pages/ReconciliationSetupWizard";
import ReconciliationFlow from "@/pages/ReconciliationFlow";
import InvestigateTransactions from "@/pages/InvestigateTransactions";
import { Loader2 } from "lucide-react";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/create" component={CreatePeriod} />
      <Route path="/setup/:periodId" component={ReconciliationSetupWizard} />
      <Route path="/flow/:periodId" component={ReconciliationFlow} />
      <Route path="/investigate" component={InvestigateTransactions} />
      <Route path="/report" component={ReportView} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

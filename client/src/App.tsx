import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import CreatePeriod from "@/pages/CreatePeriod";
import UploadFiles from "@/pages/UploadFiles";
import ColumnMapping from "@/pages/ColumnMapping";
import ReconcileTransactions from "@/pages/ReconcileTransactions";
import ReportView from "@/pages/ReportView";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/create" component={CreatePeriod} />
      <Route path="/upload" component={UploadFiles} />
      <Route path="/mapping" component={ColumnMapping} />
      <Route path="/reconcile" component={ReconcileTransactions} />
      <Route path="/report" component={ReportView} />
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

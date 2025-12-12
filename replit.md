# Pieter's Pomp Stasie Reconner

## Overview

Pieter's Pomp Stasie Reconner is a data-intensive web application designed to simplify financial reconciliation for fuel station owners and accountants. It automates the matching of transactions between fuel management systems and bank accounts, helping users identify and resolve discrepancies efficiently. The platform supports uploading various transaction files, intelligent data mapping, automated and manual matching, and comprehensive report generation. Its core purpose is to provide clarity, efficiency, and trustworthy data for crucial financial workflows, ultimately saving time and reducing errors in the reconciliation process.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The application uses React 18 with TypeScript and Vite. The UI is built with `shadcn/ui` (New York style) on Radix UI primitives, styled with Tailwind CSS, and adheres to Material Design principles for SaaS productivity. Typography uses Inter for UI and JetBrains Mono for data. A custom color system supports light/dark modes. The design features a 12-column responsive grid, consistent spacing, and a status badge system for visual feedback. Specialized components facilitate the reconciliation workflow, including `PeriodCard`, `TransactionTable`, `ColumnMappingTable`, `ManualMatchPanel`, and `ReconciliationSummary`.

### Technical Implementations

**Frontend:**
- **State Management:** TanStack Query for server state and caching; React hooks for local state.
- **Routing:** Wouter for client-side routing.
- **4-Step Reconciliation Flow:** A streamlined workflow with clear steps:
  1. **Upload Fuel Data** - Import fuel master file with quality validation
  2. **Upload Bank Data** - Import bank statement with quality validation
  3. **Configure Matching** - Select matching preset (Conservative/Moderate/Aggressive) or customize rules
  4. **Results Dashboard** - View matched/unmatched/unmatchable transactions with bank-focused metrics
- **Step Gating:** Prerequisites enforced at each step - users cannot advance until previous steps are completed.
- **Data Quality:** A sophisticated `DataQualityValidator` service analyzes uploaded files for issues (column shifts, type mismatches, etc.), providing a "reassurance-first" UX with categorized warnings and suggested fixes.
- **Investigation View:** Dedicated page (`/investigate`) for reviewing unmatched bank transactions with manual matching capability. Features smart categorization (Quick Wins >80%, Investigate 50-80%, No Match Found, Low Value <R50) and bulk actions.
- **Bulk Actions:** "Confirm All" for Quick Wins and "Flag All for Review" for No Match Found categories.
- **Resolution Tracking:** Distinguishes CLOSED (linked/reviewed/dismissed/written_off) from PENDING (flagged) resolutions with summary breakdown.
- **Verification-Based Metrics:** Reports focus on verifiable transactions, distinguishing them from unverified ones to provide accurate reconciliation rates.
- **Period Coverage Timeline:** Visual timeline showing reporting period, fuel data range, and bank data ranges with gap detection.

**Backend:**
- **Server:** Express.js with TypeScript and ESM modules, running on Node.js.
- **Authentication:** Replit Auth via OpenID Connect (Google login), with session management using PostgreSQL.
- **Admin Features:** Dedicated admin dashboard and API routes for user management.
- **Database:** Drizzle ORM for type-safe queries with Neon serverless PostgreSQL, using a schema-first design.
- **File Processing:** Multer for uploads, PapaParse for CSV, and xlsx for Excel. A `FileParser` service unifies parsing. Features include content-based duplicate detection, safe file replacement, and upload timeouts.
- **Data Model:** Core entities include `ReconciliationPeriod`, `UploadedFile`, `Transaction`, `Match`, `MatchingRules`, and `User`.
- **Card-Based Matching:** Supports matching based on card transactions, utilizing the last 4 digits of card numbers.
- **Configurable Matching Rules:** Per-period matching rules with presets (Conservative, Moderate, Aggressive) allow customization of amount tolerance, date/time windows, invoice grouping, and confidence thresholds.
- **Invoice Grouping:** Groups fuel transactions by invoice number to aggregate amounts for matching.
- **Auto-Match Scoring:** A scoring system based on amount, date, reference, and card number determines match confidence.
- **Report Generation:** `jsPDF` and `xlsx` for generating PDF and Excel reports, with a `ReportGenerator` service calculating summaries and discrepancies.
- **Storage:** Google Cloud Storage (via Replit Object Storage) for persistent file storage.

### Feature Specifications

- **Automated Matching:** Automatically matches transactions based on configurable rules and confidence scores.
- **Manual Review:** Provides tools for users to manually match or unmatch transactions and resolve discrepancies.
- **Comprehensive Reporting:** Generates detailed reports including verification status, coverage analysis, discrepancy reports, and matching results.
- **User Management:** Admin functionality for managing users and their roles.

### System Design Choices

- **API Structure:** RESTful JSON API with Zod schema validation for request payloads and consistent error handling.
- **Microservices-like Components:** Services like `FileParser`, `DataQualityValidator`, `ReportGenerator`, and `ObjectStorageService` encapsulate specific functionalities.
- **Workflow State Management:** Clear status tracking for periods, files, and transactions (e.g., `draft` -> `in_progress` -> `complete` for periods).

## External Dependencies

### Third-Party Services

- **Google Cloud Storage:** Used for persistent file storage, integrated via Replit Object Storage.
- **Neon Database:** Serverless PostgreSQL database for all application data, provisioned through Replit.

### Key NPM Dependencies

- **UI Frameworks & Utilities:** `@radix-ui/*`, `@tanstack/react-query`, `cmdk`, `class-variance-authority`, `clsx`, `tailwind-merge`, `date-fns`, `lucide-react`.
- **Backend Processing:** `@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit`, `express`, `multer`, `papaparse`, `xlsx`, `jspdf`, `jspdf-autotable`.
- **Development Tools:** `typescript`, `tsx`, `vite`, `@vitejs/plugin-react`, `@replit/*` plugins, `wouter`.

### Environment Configuration

- **Required:** `DATABASE_URL`, `PRIVATE_OBJECT_DIR`, `NODE_ENV`.
- **Optional:** `REPL_ID`.
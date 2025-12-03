# Pieter's Pomp Stasie Reconner

## Overview

This is a data-intensive business application designed for fuel station owners and accountants to reconcile transactions between fuel management systems and bank accounts. The platform enables users to create reconciliation periods, upload transaction files from multiple sources (fuel systems and bank accounts), map data columns, automatically match transactions, manually review discrepancies, and generate comprehensive reports. Built as a full-stack web application, it emphasizes clarity, efficiency, and trustworthy data presentation for financial reconciliation workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server, configured for fast HMR and optimized production builds
- Wouter for lightweight client-side routing without React Router overhead

**UI Component System**
- shadcn/ui component library (New York style) built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Material Design principles adapted for SaaS productivity applications
- Typography hierarchy using Inter (UI/body text) and JetBrains Mono (data/numbers) fonts
- Custom color system with HSL values supporting light/dark modes through CSS variables

**State Management**
- TanStack Query (React Query) for server state management, caching, and data fetching
- Custom query client with configured defaults (no refetching, infinite stale time)
- Local component state with React hooks for UI interactions

**Design System**
- 12-column responsive grid layout with Tailwind spacing primitives
- Consistent component padding and spacing using multiples of 4px
- Status badge system for visual feedback (draft, in_progress, complete, matched, unmatched, partial)
- Specialized components for reconciliation workflow: PeriodCard, TransactionTable, ColumnMappingTable, ManualMatchPanel, ReconciliationSummary

### Backend Architecture

**Server Framework**
- Express.js with TypeScript running on Node.js
- ESM modules throughout the codebase
- Custom middleware for request logging and JSON body parsing with raw body capture

**Database Layer**
- Drizzle ORM for type-safe database queries and schema management
- Neon serverless PostgreSQL with WebSocket connection pooling
- Schema-first design with Zod validation schemas derived from Drizzle tables
- Five core tables: users, reconciliation_periods, uploaded_files, transactions, matches

**File Processing**
- Multer for multipart file uploads with in-memory storage (50MB limit)
- PapaParse for CSV parsing with automatic header detection
- xlsx (SheetJS) for Excel file parsing (XLS, XLSX formats)
- Custom FileParser service providing unified interface for multiple file formats
- Column mapping detection with confidence scoring for automatic field suggestions

**Report Generation**
- jsPDF with autoTable plugin for PDF report generation
- xlsx for Excel export functionality
- Custom ReportGenerator service calculating reconciliation summaries, match rates, and discrepancies
- Support for multiple export formats (PDF, Excel)

**Storage Services**
- IStorage interface defining data access patterns for all entities
- CRUD operations for periods, files, transactions, and matches
- Batch transaction creation for efficient file imports
- Cascade deletion relationships (deleting period removes all associated files, transactions, matches)

**Development Tools**
- Replit-specific Vite plugins for development experience (runtime error overlay, cartographer, dev banner)
- Custom Vite logger that exits process on error for fail-fast behavior

### Data Model

**Core Entities**
- **ReconciliationPeriod**: Top-level entity with name, date range, description, and status (draft/in_progress/complete)
- **UploadedFile**: Tracks source files with metadata (periodId, fileName, fileType, sourceType, sourceName, fileUrl, fileSize, status, rowCount, columnMapping)
- **Transaction**: Individual financial records with date, amount, reference, description, source details, match status, isCardTransaction flag, and cardNumber (last 4 digits)
- **Match**: Links related transactions with confidence scores and optional notes
- **MatchingRules**: Per-period matching configuration with tolerance thresholds, date windows, invoice grouping, and confidence settings
- **User**: Basic authentication entity (currently minimal implementation)

**Card-Based Matching**
- Only CARD transactions are matched (cash transactions appear in reports but aren't reconciled)
- Card number matching uses last 4 digits (e.g., ****1234) when available
- Bank sources detected with startsWith('bank') to handle bank, bank2, bank_account variations
- Source presets for FNB Merchant, ABSA Merchant, Fuel Master with automatic column detection

**Configurable Matching Rules**
- Per-period matching configuration stored in `matching_rules` table
- Presets for quick configuration: Conservative, Moderate (default), Aggressive
- Configurable parameters:
  - Amount Tolerance: R0.01 to R10.00 (how much amounts can differ)
  - Date Window: 1 to 7 days (how far apart dates can be)
  - Time Window: 30 to 240 minutes (for same-day matching)
  - Group by Invoice: Groups multi-line fuel purchases by invoice number before matching
  - Require Card Match: Stricter matching requiring card number agreement
  - Minimum Confidence: 50-90% threshold for matches
  - Auto-Match Threshold: 70-95% for automatic matching without review
- API endpoints: GET/POST `/api/periods/:periodId/matching-rules`
- Zod validation ensures data integrity

**Invoice Grouping Algorithm**
- Critical for high match rates (improves from ~3% to 80%+)
- Groups fuel transactions by invoice number
- Aggregates amounts for matching to single bank transactions
- Handles multi-line purchases (fuel + extras on same invoice)

**Auto-Match Scoring**
- Amount match: 50 points (exact match with configurable tolerance)
- Date match: 30 points (within configurable date window)
- Reference match: 20 points (exact or partial)
- Card number match: +20 points when both sides have matching card numbers
- Card number mismatch: -30 penalty when both have card numbers but they differ

**Workflow States**
- Period lifecycle: draft → in_progress → complete
- Transaction matching: unmatched → partial → matched
- File processing: uploaded → validated → processed

### API Structure

**RESTful Endpoints**
- `GET /api/periods` - List all reconciliation periods
- `GET /api/periods/:id` - Get specific period details
- `POST /api/periods` - Create new reconciliation period
- `GET /api/periods/:id/verification-summary` - Verification-based reconciliation metrics
- File upload endpoints with multipart/form-data support
- Column mapping validation endpoints
- Transaction matching and manual review endpoints
- Report generation and export endpoints

**Request/Response Patterns**
- JSON API with standard error handling
- Zod schema validation for request payloads
- Consistent error response format with status codes
- Request logging with duration tracking and response capture

### User Workflow

**Multi-Step Reconciliation Process**
1. **Dashboard** - View all periods with status cards and period list; "Edit" opens existing period, "View Report" goes to report
2. **Create Period** - Define reconciliation period with name, description, and date range
3. **Upload Files** - Upload fuel management and bank account transaction files (requires fuel + at least one bank file)
   - Shows existing uploaded files with Replace button to upload new file over existing one
   - File cards display: filename, size, row count, mapping status
4. **Column Mapping** - Map detected columns to required fields (date, amount, reference, description, card number)
5. **Reconcile Transactions** - Review automatic matches, resolve partial matches, manually match unmatched transactions
6. **Report View** - Redesigned verification-based reconciliation dashboard with 6 sections

**Page Components**
- Dashboard: Period overview with metrics and quick actions
- CreatePeriod: Form-based period creation
- UploadFiles: Drag-and-drop file upload zones for multiple sources
- ColumnMapping: Interactive column mapping with sample data preview
- ReconcileTransactions: Tabbed transaction views with manual matching panel
- ReportView: Verification-based dashboard with 6 sections:
  1. Overview: Fuel vs bank data side-by-side
  2. Verification Status: Verified, pending, unverified, cash breakdown
  3. Coverage Analysis: Volume and date coverage with gap analysis
  4. Discrepancy Report: Financial differences and pending verification
  5. Matching Results: Performance rating (1-5 stars) with match quality metrics
  6. Recommended Actions: Priority-based action items (Critical, Important, Optional)

**Key Insight: Verification-Based Metrics**
- Shows match rate for VERIFIABLE transactions only (e.g., 79.4%)
- Not misleading overall rate (e.g., 3.81%)
- Clearly separates what CAN be verified from what CANNOT be verified
- Helps users understand they need to upload more bank data

## External Dependencies

### Third-Party Services

**Google Cloud Storage**
- Used for persistent file storage via Replit Object Storage integration
- Authentication through Replit sidecar with external account credentials
- Custom ObjectStorageService wrapping GCS client
- Stores uploaded transaction files with UUID-based paths

**Neon Database**
- Serverless PostgreSQL database for production data storage
- WebSocket-based connection pooling for serverless environments
- Provisioned through Replit database integration
- Connection string required via DATABASE_URL environment variable

### Key NPM Dependencies

**UI Framework**
- @radix-ui/* (23 packages) - Headless UI primitives for accessible components
- @tanstack/react-query - Server state management
- cmdk - Command palette component
- class-variance-authority, clsx, tailwind-merge - Styling utilities
- date-fns - Date manipulation
- lucide-react - Icon library

**Backend Processing**
- @neondatabase/serverless - PostgreSQL client
- drizzle-orm, drizzle-kit - ORM and migrations
- express - Web server framework
- multer - File upload handling
- papaparse - CSV parsing
- xlsx - Excel file processing
- jspdf, jspdf-autotable - PDF generation

**Development**
- typescript, tsx - TypeScript tooling
- vite, @vitejs/plugin-react - Build system
- @replit/* plugins - Replit-specific development tools
- wouter - Routing library

### Environment Configuration

**Required Variables**
- `DATABASE_URL` - Neon PostgreSQL connection string
- `PRIVATE_OBJECT_DIR` - Google Cloud Storage bucket path for file uploads
- `NODE_ENV` - Runtime environment (development/production)

**Optional Variables**
- `REPL_ID` - Replit deployment identifier for conditional plugin loading
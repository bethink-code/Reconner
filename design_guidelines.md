# Design Guidelines: Fuel Station Reconciliation Platform

## Design Approach

**Selected Approach:** Design System - Material Design principles adapted for modern SaaS productivity applications

**Design Philosophy:** This is a data-intensive business application requiring clarity, efficiency, and trustworthy presentation. Drawing inspiration from Linear's typography hierarchy, Notion's clean data presentation, and Stripe's restrained professionalism. The interface prioritizes information density without clutter, clear workflow progression, and confident data visualization.

## Typography System

**Font Families:**
- Primary: Inter (Google Fonts) - for UI elements, tables, body text
- Secondary: JetBrains Mono (Google Fonts) - for transaction IDs, reference numbers, monetary values

**Hierarchy:**
- Page Titles: text-3xl font-semibold (36px)
- Section Headers: text-2xl font-semibold (24px)
- Card Titles: text-lg font-medium (18px)
- Table Headers: text-sm font-semibold uppercase tracking-wide (14px)
- Body Text: text-base (16px)
- Data/Numbers: text-sm font-mono (14px)
- Labels: text-sm font-medium (14px)
- Helper Text: text-xs (12px)

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section spacing: py-8 to py-12
- Card spacing: p-6
- Table cell padding: px-4 py-3
- Button padding: px-4 py-2 (standard), px-6 py-3 (large)

**Grid Structure:**
- Dashboard: 12-column grid with 6-unit gaps
- Status cards: 3-column grid on desktop (grid-cols-1 md:grid-cols-3)
- Main content: max-w-7xl centered container with px-6

## Component Library

### Navigation & Structure

**Top Navigation Bar:**
- Fixed header (h-16) with application logo, reconciliation period selector, user menu
- Breadcrumb navigation below header showing current workflow step
- Quick action buttons (New Reconciliation, Download Reports) in header

**Sidebar (Optional Context Panel):**
- Width: w-64, collapsible on mobile
- Contains period overview, progress indicators, quick filters
- Sticky positioning during scroll

### Dashboard Components

**Period Status Cards:**
- Grid layout displaying key metrics (3-column on desktop)
- Each card: rounded-lg border with p-6
- Large number display (text-3xl font-bold) with label below
- Icon indicators for status (in-progress, complete, draft)
- Subtle hover lift effect (hover:shadow-lg transition)

**Reconciliation Period Table:**
- Full-width responsive table with alternating row treatment
- Columns: Period Name, Date Range, Status Badge, Progress %, Last Modified, Actions
- Status badges: inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
- Action buttons: icon-only with tooltips for Edit/View/Delete
- Pagination controls at bottom (items per page: 10, 25, 50)

### File Upload Interface

**Upload Zone:**
- Large dropzone area (min-h-64) with dashed border
- Center-aligned upload icon (h-12 w-12) and instructional text
- "Browse files" button as secondary action
- Multi-file support with individual file cards showing name, size, type, remove button
- Progress bars for each uploading file (h-2 rounded-full)

**Column Mapping Interface:**
- Side-by-side preview: uploaded data on left (first 5 rows), mapping controls on right
- Dropdown selectors for each detected column mapped to required fields
- Visual indicators for mapped/unmapped columns
- Sample data preview updates in real-time as mapping changes

### Transaction Matching View

**Match Status Overview:**
- Summary cards showing: Total Transactions, Matched, Unmatched, Partial Matches
- Color-coded progress bar showing reconciliation completion percentage

**Transaction Tables:**
- Tabbed interface: All Transactions, Matched, Unmatched, Needs Review
- Split view option for comparing fuel vs bank transactions side-by-side
- Each transaction row expandable to show details and matching candidates
- Checkbox selection for bulk actions
- Match confidence indicator (percentage or visual bars) for partial matches

**Match Actions Panel:**
- Sliding panel from right (w-96) when reviewing transaction
- Shows detailed transaction information in structured format
- Suggested matches with confidence scores
- Manual match button, split transaction controls
- Notes/annotation textarea (min-h-24)
- Confirm/Reject action buttons

### Forms & Inputs

**Input Fields:**
- Consistent height (h-10 for standard, h-12 for prominent)
- Border treatment with focus states
- Label above input (text-sm font-medium mb-2)
- Helper text below (text-xs)
- Error states with inline error messages

**Date Range Picker:**
- Dual calendar view for start/end date selection
- Preset quick selections (Last 7 days, Last 30 days, Last Quarter)
- Clear visual distinction between selected range

**Action Buttons:**
- Primary: px-6 py-3 rounded-lg font-medium
- Secondary: outlined variant with same dimensions
- Destructive: separate styling for delete/cancel actions
- Icon buttons: w-10 h-10 rounded-md for compact actions

### Reporting Components

**Report Preview:**
- Card-based layout showing report sections
- Print-optimized layout with A4 proportions preview
- Section headers with collapse/expand controls
- Summary metrics prominently displayed at top
- Export format selector (PDF, Excel, CSV) with download button

**Data Visualization:**
- Simple bar charts for discrepancy trends
- Donut chart for reconciliation status breakdown
- Clean, minimalist chart design without excessive decoration
- Legend positioned below charts

## Animations & Interactions

**Minimal Animation Strategy:**
- Smooth transitions for dropdown/modal appearances (duration-200)
- Subtle hover lift on cards (hover:-translate-y-1)
- Loading states: simple spinner or skeleton screens for data tables
- No scroll-triggered animations or complex motion
- Focus on instant feedback for user actions

## Accessibility Standards

**Keyboard Navigation:**
- Full keyboard support for all workflows (Tab, Enter, Escape)
- Focus indicators clearly visible (ring-2 ring-offset-2)
- Skip navigation links for long tables

**Screen Reader Support:**
- Semantic HTML throughout (nav, main, table, form elements)
- ARIA labels for icon-only buttons
- Table headers properly marked with scope attributes
- Status announcements for async operations (uploads, matching)

**Form Accessibility:**
- Labels explicitly associated with inputs (htmlFor)
- Required field indicators both visual and announced
- Error messages linked to inputs via aria-describedby
- Fieldset grouping for related inputs

## Responsive Behavior

**Breakpoint Strategy:**
- Mobile (base): Single column, stacked layout, hamburger navigation
- Tablet (md: 768px): 2-column grids, visible sidebar
- Desktop (lg: 1024px): Full multi-column layouts, expanded tables
- Large (xl: 1280px): Maximum content width, side panels

**Mobile Adaptations:**
- Tables convert to card-based stack view with key information
- File upload becomes simpler button-triggered interface
- Period cards stack vertically
- Action buttons fixed to bottom for easy thumb access

## Images

**No hero images required.** This is a productivity application focused on data and workflows. Visual assets limited to:
- Application logo in header (h-8)
- Empty state illustrations for zero-data scenarios (reconciliation list, transaction views)
- Icon set from Heroicons for UI elements (outline style for secondary actions, solid for primary)
export type Role = 'owner' | 'admin' | 'staff' | 'viewer';
export type DocType = 'sales_invoice' | 'official_receipt' | 'cash_invoice' | 'other';
export type PurchaseType = 'goods' | 'services' | 'capital';
export type ReceiptStatus = 'needs_review' | 'verified';

export type AccountKind = 'business' | 'firm';
export type CompanyStatus = 'active' | 'suspended';

export interface Company {
  id: string;
  name: string;
  tin: string;
  vatRegistered: boolean;
  address: string;
  /** suspended companies stay readable but cannot scan or save */
  status: CompanyStatus;
  /** scans allowed per calendar month; set per company by the operator */
  scanLimit: number;
}

export interface Session {
  userId: string;
  email: string;
  /** the workspace currently open; null for a firm that has not picked a client yet, or an owner with no company */
  companyId: string | null;
  role: Role | null;
  /** you, the platform owner */
  isAdmin: boolean;
  kind: AccountKind;
  companyCount: number;
}

/** One row in the client list (firms) or the owner console (platform owner). */
export interface CompanyStats {
  id: string;
  name: string;
  tin: string;
  vatRegistered: boolean;
  status: CompanyStatus;
  scanLimit: number;
  scansUsed: number;
  receiptsTotal: number;
  receiptsMonth: number;
  needsReview: number;
  spendMonth: number;
  lastActivity: string | null;
  createdAt: string;
  /** only filled for the platform owner */
  ownerEmail: string | null;
}

export interface FirmRow {
  userId: string;
  email: string;
  name: string;
  clients: number;
  maxClients: number;
  createdAt: string;
}

export interface Receipt {
  id: string;
  companyId: string;
  docType: DocType;
  supplierName: string;
  supplierTin: string;
  supplierAddress: string;
  /** printed "VAT Reg TIN" vs "NON-VAT Reg TIN" on the receipt */
  supplierVatRegistered: boolean;
  invoiceNo: string;
  /** yyyy-mm-dd */
  date: string;
  vatable: number;
  vatAmount: number;
  vatExempt: number;
  zeroRated: number;
  total: number;
  withholdingTax: number;
  atc: string;
  purchaseType: PurchaseType;
  paymentMethod: string;
  category: string;
  deductible: boolean;
  notes: string;
  status: ReceiptStatus;
  imagePath: string | null;
  imageHash: string | null;
  /** 0..1 per field, from the reader; empty when typed by hand */
  confidence: Record<string, number>;
  createdAt: string;
}

export type ExtractedFields = Partial<Pick<Receipt,
  'docType' | 'supplierName' | 'supplierTin' | 'supplierAddress' | 'supplierVatRegistered' | 'invoiceNo' | 'date' |
  'vatable' | 'vatAmount' | 'vatExempt' | 'zeroRated' | 'total' | 'withholdingTax' | 'paymentMethod' | 'category'>>;

export interface ExtractResult {
  fields: ExtractedFields;
  confidence: Record<string, number>;
  /** false when no reader is available (demo mode): the user types the fields in */
  read: boolean;
  message?: string;
}

export interface Issue {
  field: string;
  severity: 'error' | 'warn';
  message: string;
}


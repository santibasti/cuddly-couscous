export type Role = 'owner' | 'admin' | 'staff' | 'viewer';
export type PlanId = 'free' | 'starter' | 'business';
export type DocType = 'sales_invoice' | 'official_receipt' | 'cash_invoice' | 'other';
export type PurchaseType = 'goods' | 'services' | 'capital';
export type ReceiptStatus = 'needs_review' | 'verified';

export interface Company {
  id: string;
  name: string;
  tin: string;
  vatRegistered: boolean;
  address: string;
  plan: PlanId;
}

export interface Session {
  userId: string;
  email: string;
  companyId: string;
  role: Role;
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

export interface Plan {
  id: PlanId;
  name: string;
  pricePhp: number;
  scansPerMonth: number;
  blurb: string;
}

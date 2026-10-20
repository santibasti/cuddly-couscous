// Saved Executive reports (live site: the executive_reports table) and the two AI calls that write them.
import { CLOUD, supabase } from './cloud';
import { callFn } from './fnclient';

export interface Analysis {
  headline?: string; health?: 'strong' | 'steady' | 'watch' | 'at_risk'; summary?: string; working?: string[];
  risks?: { risk: string; why: string; severity: 'high' | 'medium' | 'low' }[];
  constraints?: { verdict?: string; explanation?: string; evidence?: string[]; what_to_do?: string[] };
  forecast?: { outlook?: string; assumptions?: string[]; could_change_it?: string[] };
  decisions?: { title: string; why: string; expected_impact: string; effort: string; confidence: string; basis: string; first_step: string }[];
  plan?: { days_30?: string[]; days_60?: string[]; days_90?: string[] };
  questions?: string[]; data_gaps?: string[];
}
export interface Research {
  findings?: { topic: string; finding: string; why_it_matters: string; source_title: string; source_url: string }[];
  ideas?: { idea: string; how_to_test_cheaply: string; source_url?: string }[];
  caution?: string;
}
export interface SavedReport { id: string; created_at: string; as_of: string; with_research: boolean; model: string | null; metrics: unknown; analysis: Analysis | null; research: Research | null }

const needLive = () => { if (!CLOUD) throw new Error('The AI report works on the live site (it needs the connection to the AI). The figures on this page work everywhere.'); };

export async function generateAnalysis(summary: unknown) { needLive(); return callFn<{ result: Analysis; model: string }>('ai-executive', { mode: 'analysis', summary }); }
export async function generateResearch(summary: unknown) { needLive(); return callFn<{ result: Research; model: string }>('ai-executive', { mode: 'research', summary }); }

export async function listReports(): Promise<SavedReport[]> {
  if (!CLOUD) return [];
  const { data, error } = await supabase().from('executive_reports').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
  if (error) { if (/does not exist|schema cache/i.test(error.message)) return []; throw new Error(error.message); }
  return (data ?? []) as SavedReport[];
}
export async function saveReport(r: { as_of: string; with_research: boolean; model: string | null; metrics: unknown; analysis: Analysis | null; research: Research | null }): Promise<SavedReport> {
  needLive();
  const { data, error } = await supabase().from('executive_reports').insert(r).select('*').single();
  if (error) throw new Error(error.message);
  return data as SavedReport;
}
export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase().from('executive_reports').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

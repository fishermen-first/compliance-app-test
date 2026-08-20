import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { templateRequiredColumns } from '@/lib/workbook-import';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new Response('Sign in required.', { status: 401 });

  const { data: membership } = await supabase.from('company_memberships').select('company_id')
    .eq('user_id', userData.user.id).eq('role', 'owner').maybeSingle();
  if (!membership) return new Response('Workspace owner access required.', { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fishermen First';
  const sheet = workbook.addWorksheet('Due Dates', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = [...templateRequiredColumns, 'period', 'status_notes', 'instructions'];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263F2D' } };
  sheet.getRow(1).height = 26;
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(headers.length).letter}1` };
  headers.forEach((header, index) => { sheet.getColumn(index + 1).width = ['item_name', 'instructions', 'status_notes'].includes(header) ? 32 : 21; });
  sheet.getColumn('J').numFmt = 'yyyy-mm-dd';
  sheet.getColumn('K').numFmt = 'yyyy-mm-dd';

  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRows([
    ['FF Compliance Import Template v1'],
    ['Do not rename or duplicate columns on the Due Dates sheet.'],
    ['Required columns', templateRequiredColumns.join(', ')],
    ['Dates', 'Use real Excel dates or YYYY-MM-DD values.'],
    ['Owner codes', 'Preserve customer codes and compound values such as SN/BJ.'],
    ['Company-wide work', 'Use Company, Office, ASMG, or ASHCO in vessel_or_scope when applicable.']
  ]);
  instructions.getColumn(1).width = 24;
  instructions.getColumn(2).width = 110;
  instructions.getRow(1).font = { bold: true, size: 16 };

  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(bytes), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="ff-compliance-import-template-v1.xlsx"',
    'Cache-Control': 'private, no-store'
  } });
}

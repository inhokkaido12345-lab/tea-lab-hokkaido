"""Verify the generated fictitious monthly PDF, not just the pre-print DOM. No live data."""
from pathlib import Path
import re, sys, json
from pypdf import PdfReader
path = Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'.sandbox-work/monthly-report-print/monthly-attendance-details-sample.pdf'
reader=PdfReader(path)
text=re.sub(r'\s+','', '\n'.join(page.extract_text() for page in reader.pages))
values=[f'2026-11-{day:02}' for day in range(1,31)]+['2026-11-01 09:00:00.000','2026-11-01 10:00:00.000','2026-11-01 10:30:00.000','2026-11-01 11:00:00.000','2026-11-01 11:15:00.000','2026-11-01 12:00:00.000','2026-11-01 14:00:00.000','2026-11-01 17:00:00.000','2026-11-03 11:00:00.123','18:15:00.000','0:45:00.000','RPT001']
for value in values:
    assert re.sub(r'\s+','',value) in text, 'Missing PDF value: '+value
assert len(reader.pages)==2, 'Inspect unexpected pagination'
print(json.dumps({'code':'MONTHLY_PDF_TEXT_VERIFIED','days':30,'pages':len(reader.pages),'allPunchTimesAndTotals':True}))

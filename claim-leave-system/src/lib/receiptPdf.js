import jsPDF from 'jspdf'
import { supabase } from './supabaseClient'
import { formatDate } from './helpers'

export async function generateReceiptPdf(payment, invoice, studentName) {
  const { data: org } = await supabase.from('organizations').select('*').eq('id', invoice.org_id).single()

  const doc = new jsPDF({ unit: 'pt', format: 'a5' })
  const marginX = 40
  let y = 50

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.text(org?.name || 'Receipt', marginX, y)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(9)
  y += 16
  if (org?.address) {
    doc.text(org.address, marginX, y)
    y += 12
  }

  y += 20
  doc.setFontSize(14)
  doc.setFont(undefined, 'bold')
  doc.text('OFFICIAL RECEIPT', marginX, y)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)

  y += 24
  const receiptNo = `R-${String(payment.receipt_no).padStart(5, '0')}`
  const rows = [
    ['Receipt No:', receiptNo],
    ['Invoice No:', `INV-${String(invoice.invoice_no).padStart(5, '0')}`],
    ['Student Name:', studentName || '—'],
    ['Payment Date:', formatDate(payment.payment_date)],
    ['Payment Method:', payment.payment_method || 'Not specified'],
  ]
  rows.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold')
    doc.text(label, marginX, y)
    doc.setFont(undefined, 'normal')
    doc.text(String(value), marginX + 110, y)
    y += 18
  })

  y += 10
  doc.setLineWidth(0.5)
  doc.line(marginX, y, 400, y)
  y += 24

  doc.setFontSize(12)
  doc.setFont(undefined, 'bold')
  doc.text('Amount Received:', marginX, y)
  doc.text(`RM ${Number(payment.amount).toFixed(2)}`, 400, y, { align: 'right' })
  doc.setFont(undefined, 'normal')
  doc.setFontSize(9)

  y += 30
  if (invoice.invoice_month) {
    doc.text(`For: ${invoice.invoice_month}`, marginX, y)
    y += 16
  }

  y += 20
  doc.setFontSize(8)
  doc.text('This is a computer-generated receipt.', marginX, y)

  doc.save(`${receiptNo}.pdf`)
}

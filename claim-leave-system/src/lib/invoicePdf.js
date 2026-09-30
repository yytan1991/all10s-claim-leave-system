import jsPDF from 'jspdf'
import { formatDate } from './helpers'

function computeItemLine(it) {
  const amt = Number(it.amount || 0)
  const taxAmt = (amt * Number(it.tax_percentage || 0)) / 100
  const adjAmt = it.adjustment_enabled ? Number(it.adjustment_amount || 0) : 0
  const adjSigned = it.adjustment_type === 'penalty' ? adjAmt : -adjAmt
  return amt + taxAmt + adjSigned
}

export async function generateInvoicePdf(invoice, org, student) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageRight = 555

  // Try several likely column names since we can't verify the exact schema
  // from here — whichever one is actually populated will be used.
  const ssmNumber = org?.ssm_number || org?.ssm_no || org?.ssm || org?.company_reg_no || org?.registration_number

  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text(org?.name || 'Invoice', marginX, 50)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(9)

  let leftY = 66
  if (ssmNumber) {
    doc.text(`SSM: ${ssmNumber}`, marginX, leftY)
    leftY += 12
  }

  // "INVOICE" and its details block align with the first line of the
  // address, not the company name.
  const addressStartY = leftY

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.text('INVOICE', 400, addressStartY)
  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)
  doc.text(`Invoice No: INV-${String(invoice.invoice_no).padStart(5, '0')}`, 400, addressStartY + 18)
  doc.text(`Issue Date: ${formatDate(invoice.issue_date)}`, 400, addressStartY + 32)
  if (invoice.due_date) doc.text(`Due Date: ${formatDate(invoice.due_date)}`, 400, addressStartY + 46)

  let y = addressStartY
  doc.setFontSize(9)
  if (org?.address) {
    const addressLines = org.address
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    addressLines.forEach((line) => {
      doc.text(line, marginX, y)
      y += 12
    })
  }
  const contactLine = [org?.phone, org?.email].filter(Boolean).join('  ·  ')
  if (contactLine) {
    doc.text(contactLine, marginX, y)
    y += 12
  }

  y = Math.max(y, addressStartY + 46) + 24
  doc.setFontSize(10)
  doc.setFont(undefined, 'bold')
  doc.text('Bill To:', marginX, y)
  doc.setFont(undefined, 'normal')
  y += 14
  doc.text(student?.full_name || '', marginX, y)
  if (invoice.invoice_month) {
    y += 14
    doc.setFontSize(9)
    doc.text(`Billing period: ${invoice.invoice_month}`, marginX, y)
    doc.setFontSize(10)
  }

  y += 30

  const col = { desc: marginX, pkg: 260, tax: 360, adj: 420, amt: pageRight }
  doc.setFillColor(150, 0, 0)
  doc.rect(marginX, y - 12, pageRight - marginX, 20, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont(undefined, 'bold')
  doc.text('Description', col.desc + 6, y + 2)
  doc.text('Package', col.pkg, y + 2)
  doc.text('Tax', col.tax, y + 2)
  doc.text('Adjustment', col.adj, y + 2)
  doc.text('Amount', col.amt, y + 2, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  doc.setFont(undefined, 'normal')
  y += 20

  const items = invoice.items?.length
    ? invoice.items
    : [{ description: invoice.description || 'Invoice item', amount: invoice.subtotal ?? invoice.amount }]

  items.forEach((it, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 248, 248)
      doc.rect(marginX, y - 12, pageRight - marginX, 20, 'F')
    }
    const descLines = doc.splitTextToSize(it.description || '', 210)
    doc.text(descLines, col.desc + 6, y + 2)
    doc.text(it.package_name || '—', col.pkg, y + 2)
    doc.text(it.tax_percentage ? `${it.tax_percentage}%` : '—', col.tax, y + 2)
    doc.text(
      it.adjustment_enabled
        ? `${it.adjustment_type === 'penalty' ? '+' : '-'} RM ${Number(it.adjustment_amount || 0).toFixed(2)}`
        : '—',
      col.adj,
      y + 2
    )
    doc.text(`RM ${computeItemLine(it).toFixed(2)}`, col.amt, y + 2, { align: 'right' })
    y += Math.max(20, descLines.length * 12)
  })

  y += 20

  const summaryLabelX = 400
  doc.setFontSize(10)
  doc.text('Sub Total:', summaryLabelX, y)
  doc.text(`RM ${Number(invoice.subtotal ?? invoice.amount).toFixed(2)}`, col.amt, y, { align: 'right' })
  y += 16
  doc.text('Tax:', summaryLabelX, y)
  doc.text(`RM ${Number(invoice.tax_amount || 0).toFixed(2)}`, col.amt, y, { align: 'right' })
  y += 16
  if (invoice.discount_amount) {
    doc.text('Discount:', summaryLabelX, y)
    doc.text(`- RM ${Number(invoice.discount_amount).toFixed(2)}`, col.amt, y, { align: 'right' })
    y += 16
  }
  doc.setFont(undefined, 'bold')
  doc.text('Grand Total:', summaryLabelX, y)
  doc.text(`RM ${Number(invoice.amount).toFixed(2)}`, col.amt, y, { align: 'right' })
  doc.setFont(undefined, 'normal')
  y += 16

  const payable = Math.max(Number(invoice.amount) - Number(invoice.payment_amount || 0), 0)
  doc.text('Amount Paid:', summaryLabelX, y)
  doc.text(`RM ${Number(invoice.payment_amount || 0).toFixed(2)}`, col.amt, y, { align: 'right' })
  y += 16
  doc.setFont(undefined, 'bold')
  doc.text('Balance Due:', summaryLabelX, y)
  doc.text(`RM ${payable.toFixed(2)}`, col.amt, y, { align: 'right' })
  doc.setFont(undefined, 'normal')
  y += 34

  if (invoice.notes) {
    doc.setFontSize(9)
    doc.text('Remark:', marginX, y)
    y += 14
    const wrapped = doc.splitTextToSize(invoice.notes, pageRight - marginX)
    doc.text(wrapped, marginX, y)
  }

  doc.save(`INV-${String(invoice.invoice_no).padStart(5, '0')}.pdf`)
}

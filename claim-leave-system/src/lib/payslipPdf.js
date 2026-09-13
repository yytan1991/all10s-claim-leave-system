import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney } from './helpers'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(month, year) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function sumItems(items) {
  return (items || []).reduce((sum, i) => sum + Number(i.amount || 0), 0)
}

function detectImageFormat(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg)/i.exec(dataUrl)
  if (!match) return 'PNG'
  return match[1].toUpperCase() === 'JPG' ? 'JPEG' : match[1].toUpperCase()
}

// Fetches an image URL and resolves to { dataUrl, width, height } — width/
// height are the image's natural pixel dimensions, used to keep the logo's
// aspect ratio correct when placed on the PDF.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = reader.result
          const img = new Image()
          img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = reject
          img.src = dataUrl
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      .catch(reject)
  })
}

export async function generatePayslipPdf(payslip, org, employee) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 50
  let textStartX = margin

  // Figure out which header lines will actually be drawn, so the logo can
  // be sized to match the full height of the text block next to it —
  // from the top of the company name down to the bottom of the last line.
  const hasAddress = Boolean(org?.address)
  const contactLine = [org?.registration_no && `SSM No: ${org.registration_no}`, org?.phone, org?.email]
    .filter(Boolean)
    .join('   |   ')
  const hasContact = Boolean(contactLine)

  const nameLineHeight = 16
  const otherLineHeight = 12
  let headerBlockHeight = nameLineHeight
  if (hasAddress) headerBlockHeight += otherLineHeight
  if (hasContact) headerBlockHeight += otherLineHeight

  // ---------- Company logo (if set) ----------
  if (org?.logo_url) {
    try {
      const { dataUrl, width, height } = await loadImage(org.logo_url)
      const targetHeight = headerBlockHeight + 4
      const targetWidth = (width / height) * targetHeight
      doc.addImage(dataUrl, detectImageFormat(dataUrl), margin, y - 14, targetWidth, targetHeight)
      textStartX = margin + targetWidth + 15
    } catch (err) {
      console.error('Could not load company logo for PDF', err)
    }
  }

  // ---------- Company header ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(org?.name || 'Company Name', textStartX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += nameLineHeight
  if (hasAddress) {
    doc.text(org.address, textStartX, y)
    y += otherLineHeight
  }
  if (hasContact) {
    doc.text(contactLine, textStartX, y)
    y += otherLineHeight
  }

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('PAYSLIP', pageWidth / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(monthLabel(payslip.period_month, payslip.period_year), pageWidth / 2, y + 14, { align: 'center' })
  y += 34

  // ---------- Employee details ----------
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 16

  doc.setFontSize(9)
  const leftCol = margin
  const rightCol = pageWidth / 2 + 10
  const rows = [
    ['Employee Name', employee?.full_name || '—', 'Position', employee?.position || '—'],
    ['Staff ID / IC', employee?.ic_number || '—', 'Department', employee?.department || '—'],
    ['Bank', employee?.bank_name || '—', 'Account No.', employee?.bank_account_no || '—'],
  ]
  rows.forEach(([l1, v1, l2, v2]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(l1, leftCol, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v1), leftCol + 90, y)
    doc.setFont('helvetica', 'bold')
    doc.text(l2, rightCol, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v2), rightCol + 90, y)
    y += 16
  })

  y += 10

  // ---------- Earnings & Deductions tables side by side ----------
  const earningsRows = [['Basic Salary', formatMoney(payslip.basic_salary)]]
  ;(payslip.earnings || []).forEach((e) => earningsRows.push([e.label, formatMoney(e.amount)]))
  const grossPay = Number(payslip.basic_salary || 0) + sumItems(payslip.earnings)

  const deductionRows = [
    ['EPF (Employee)', formatMoney(payslip.epf_employee)],
    ['SOCSO (Employee)', formatMoney(payslip.socso_employee)],
    ['EIS (Employee)', formatMoney(payslip.eis_employee)],
    ['PCB', formatMoney(payslip.pcb)],
  ]
  ;(payslip.other_deductions || []).forEach((d) => deductionRows.push([d.label, formatMoney(d.amount)]))
  const totalDeductions =
    Number(payslip.epf_employee || 0) +
    Number(payslip.socso_employee || 0) +
    Number(payslip.eis_employee || 0) +
    Number(payslip.pcb || 0) +
    sumItems(payslip.other_deductions)

  const colWidth = (pageWidth - margin * 2 - 20) / 2

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - colWidth },
    tableWidth: colWidth,
    head: [['Earnings', 'Amount (RM)']],
    body: earningsRows,
    foot: [['Gross Pay', formatMoney(grossPay)]],
    theme: 'grid',
    headStyles: { fillColor: [18, 33, 43], fontSize: 9 },
    footStyles: { fillColor: [234, 246, 243], textColor: [18, 33, 43], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    styles: { cellPadding: 5 },
  })

  autoTable(doc, {
    startY: y,
    margin: { left: margin + colWidth + 20 },
    tableWidth: colWidth,
    head: [['Deductions', 'Amount (RM)']],
    body: deductionRows,
    foot: [['Total Deductions', formatMoney(totalDeductions)]],
    theme: 'grid',
    headStyles: { fillColor: [18, 33, 43], fontSize: 9 },
    footStyles: { fillColor: [251, 234, 234], textColor: [18, 33, 43], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    styles: { cellPadding: 5 },
  })

  const afterTablesY = Math.max(doc.lastAutoTable.finalY, doc.lastAutoTable.finalY) + 20

  // ---------- Net pay ----------
  const netPay = grossPay - totalDeductions
  doc.setFillColor(18, 33, 43)
  doc.rect(margin, afterTablesY, pageWidth - margin * 2, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('NET PAY', margin + 12, afterTablesY + 20)
  doc.text(formatMoney(netPay), pageWidth - margin - 12, afterTablesY + 20, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  let y2 = afterTablesY + 50

  // ---------- Employer contributions (informational, doesn't affect net pay) ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text("Employer's Statutory Contributions (for information only)", margin, y2)
  y2 += 14
  doc.setFont('helvetica', 'normal')
  const employerLine = `EPF: ${formatMoney(payslip.epf_employer)}    SOCSO: ${formatMoney(
    payslip.socso_employer
  )}    EIS: ${formatMoney(payslip.eis_employer)}`
  doc.text(employerLine, margin, y2)
  y2 += 24

  if (payslip.notes) {
    doc.setFont('helvetica', 'bold')
    doc.text('Notes', margin, y2)
    y2 += 14
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(payslip.notes, pageWidth - margin * 2)
    doc.text(noteLines, margin, y2)
    y2 += noteLines.length * 12 + 10
  }

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(
    `This is a computer-generated payslip. Generated on ${new Date().toLocaleDateString('en-MY')}.`,
    margin,
    doc.internal.pageSize.getHeight() - 30
  )

  const fileName = `payslip-${employee?.full_name?.replace(/\s+/g, '_') || 'staff'}-${payslip.period_year}-${String(
    payslip.period_month
  ).padStart(2, '0')}.pdf`
  doc.save(fileName)
}
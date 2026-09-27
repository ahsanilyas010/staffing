import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', color: '#1e293b' },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subheader: { fontSize: 10, color: '#64748b', marginBottom: 24 },
  paragraph: { marginBottom: 12, lineHeight: 1.5 },
  label: { fontWeight: 'bold' },
  table: { marginTop: 16, marginBottom: 16 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rowLabel: { width: 160, color: '#64748b' },
  rowValue: { flex: 1, fontWeight: 'bold' },
  footer: { marginTop: 32, fontSize: 9, color: '#94a3b8' },
})

interface OfferLetterProps {
  entityName: string
  candidateName: string
  role: string
  salaryPkr: number
  startDate: string
  probationDays: number
  location: string
}

function OfferLetterDocument(props: OfferLetterProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{props.entityName}</Text>
        <Text style={styles.subheader}>Offer of Employment</Text>

        <Text style={styles.paragraph}>Dear {props.candidateName},</Text>
        <Text style={styles.paragraph}>
          We are pleased to offer you the position of <Text style={styles.label}>{props.role}</Text> at{' '}
          {props.entityName}. We were impressed by your background and believe you will be a valuable addition to
          our team.
        </Text>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Position</Text>
            <Text style={styles.rowValue}>{props.role}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Monthly Salary</Text>
            <Text style={styles.rowValue}>PKR {props.salaryPkr.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Start Date</Text>
            <Text style={styles.rowValue}>{props.startDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Probation Period</Text>
            <Text style={styles.rowValue}>{props.probationDays} days</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Location</Text>
            <Text style={styles.rowValue}>{props.location}</Text>
          </View>
        </View>

        <Text style={styles.paragraph}>
          This offer is contingent upon successful completion of any pre-employment requirements. Please review and
          respond to this offer using the link provided in your invitation within 72 hours.
        </Text>
        <Text style={styles.paragraph}>
          We look forward to welcoming you to the team.
        </Text>
        <Text style={styles.paragraph}>Sincerely,{'\n'}Human Resources{'\n'}{props.entityName}</Text>

        <Text style={styles.footer}>
          This is a system-generated offer letter. For questions, contact hr@assorted.group.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderOfferLetterPdf(props: OfferLetterProps): Promise<Buffer> {
  return renderToBuffer(<OfferLetterDocument {...props} />)
}

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ProspectBrief, DecisionMaker } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  text:    '#1A1A1A',
  text2:   '#555550',
  text3:   '#888880',
  border:  '#E4E1DA',
  surface: '#F6F5F1',
  green:   '#085041',
  greenBg: '#E1F5EE',
  amber:   '#633806',
  amberBg: '#FEF3DA',
  coral:   '#D85A30',
  coralBg: '#FAECE7',
  blue:    '#0C447C',
  blueBg:  '#E6F1FB',
}

const s = StyleSheet.create({
  page:       { paddingHorizontal: 44, paddingVertical: 40, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' },
  // Header
  header:     { marginBottom: 16 },
  co:         { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.text },
  meta:       { fontSize: 9, color: C.text2, marginTop: 3 },
  // Timing pill
  timingRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  pill:       { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillText:   { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  timingNote: { fontSize: 8, color: C.text2, flex: 1 },
  // Stats row
  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox:    { flex: 1, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', padding: 10 },
  statLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue:  { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 2 },
  statCtx:    { fontSize: 8, color: C.text2 },
  // Section card
  card:       { borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', marginBottom: 10, overflow: 'hidden' },
  cardHead:   { paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#FAFAF8' },
  cardLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardBody:   { paddingHorizontal: 12, paddingVertical: 10 },
  // Body text
  body:       { fontSize: 9, color: C.text, lineHeight: 1.6 },
  // Two-col grid
  twoCol:     { flexDirection: 'row', gap: 10, marginBottom: 10 },
  col:        { flex: 1 },
  // List items
  listItem:   { flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.border },
  listItemLast: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingVertical: 5 },
  dot:        { width: 5, height: 5, borderRadius: 3, marginTop: 3, flexShrink: 0 },
  // News
  newsItem:   { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  newsItemLast: { paddingVertical: 6 },
  newsMeta:   { fontSize: 7, color: C.text3, marginBottom: 2 },
  newsText:   { fontSize: 9, color: C.text, lineHeight: 1.5 },
  // DM cards
  dmCard:     { borderRadius: 5, borderWidth: 1, borderColor: C.border, padding: 9, marginBottom: 7 },
  dmHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dmAvatar:   { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dmInitials: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  dmName:     { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text },
  dmTitle:    { fontSize: 8, color: C.text2 },
  dmRolePill: { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 5 },
  dmRoleText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  dmFieldLbl: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, marginBottom: 2 },
  dmFieldVal: { fontSize: 8, color: C.text, lineHeight: 1.5 },
  // Email
  emailSubject: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6 },
  emailBody:    { fontSize: 9, color: C.text, lineHeight: 1.7 },
  // Tech tags
  techRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  techTag:    { borderRadius: 4, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, paddingVertical: 3 },
  techTagTxt: { fontSize: 8, color: C.text2 },
  // Footer
  footer:     { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt:  { fontSize: 7, color: C.text3 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  champion:       { bg: C.greenBg,  text: C.green },
  economic_buyer: { bg: C.blueBg,   text: C.blue  },
  gatekeeper:     { bg: C.coralBg,  text: C.coral },
  end_user:       { bg: '#EEEDFE',  text: '#3C3489' },
  influencer:     { bg: C.amberBg,  text: C.amber },
  custom:         { bg: '#F0EEE9',  text: '#6B6A64' },
}

function timingPillStyle(status: string | null) {
  if (status === 'open')       return { bg: C.greenBg, text: C.green,  label: 'Window open' }
  if (status === 'approaching') return { bg: C.amberBg, text: C.amber,  label: 'Approaching' }
  return                               { bg: '#F0EEE9',  text: '#6B6A64', label: 'Monitoring' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────────────────────────────────────
type Props = {
  prospectName: string
  brief: ProspectBrief
  dms: DecisionMaker[]
  exportedAt: string
}

export function BriefPdf({ prospectName, brief, dms, exportedAt }: Props) {
  const { timing, stats, snapshot, initiatives, pain_signals, news, outreach_angle, tech_signals, email } = brief
  const tp = timingPillStyle(timing?.window_status ?? null)

  return (
    <Document
      title={`${prospectName} — SalesLord brief`}
      author="SalesLord"
      creator="SalesLord"
    >
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.co}>{prospectName}</Text>
          {timing && (
            <Text style={s.meta}>
              FY ends {timing.fy_end}
              {stats?.stage?.value ? `  ·  ${stats.stage.value}` : ''}
              {timing.recommended_outreach_window ? `  ·  Best window: ${timing.recommended_outreach_window}` : ''}
            </Text>
          )}
        </View>

        {/* Timing pill + reasoning */}
        {timing && (
          <View style={s.timingRow}>
            <View style={[s.pill, { backgroundColor: tp.bg }]}>
              <Text style={[s.pillText, { color: tp.text }]}>{tp.label}</Text>
            </View>
            {timing.reasoning && (
              <Text style={s.timingNote}>{timing.reasoning}</Text>
            )}
          </View>
        )}

        {/* Stats */}
        {stats && (
          <View style={s.statsRow}>
            {(['revenue', 'headcount', 'open_roles', 'stage'] as const).map(key => {
              const st = stats[key]
              const labels = { revenue: 'Revenue', headcount: 'Headcount', open_roles: 'Open roles', stage: 'Stage' }
              return (
                <View key={key} style={s.statBox}>
                  <Text style={s.statLabel}>{labels[key]}</Text>
                  <Text style={s.statValue}>{st?.value ?? '—'}</Text>
                  {st?.context && <Text style={s.statCtx}>{st.context}</Text>}
                </View>
              )
            })}
          </View>
        )}

        {/* Snapshot */}
        {snapshot && (
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Snapshot</Text></View>
            <View style={s.cardBody}><Text style={s.body}>{snapshot}</Text></View>
          </View>
        )}

        {/* Initiatives + Pain — two columns */}
        {((initiatives?.length ?? 0) > 0 || (pain_signals?.length ?? 0) > 0) && (
          <View style={s.twoCol}>
            {(initiatives?.length ?? 0) > 0 && (
              <View style={[s.col, s.card, { marginBottom: 0 }]}>
                <View style={s.cardHead}><Text style={s.cardLabel}>Strategic initiatives</Text></View>
                <View style={s.cardBody}>
                  {initiatives.map((item, i) => (
                    <View key={i} style={i < initiatives.length - 1 ? s.listItem : s.listItemLast}>
                      <View style={[s.dot, { backgroundColor: '#1D9E75' }]} />
                      <Text style={s.body}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {(pain_signals?.length ?? 0) > 0 && (
              <View style={[s.col, s.card, { marginBottom: 0 }]}>
                <View style={s.cardHead}><Text style={s.cardLabel}>Pain signals</Text></View>
                <View style={s.cardBody}>
                  {pain_signals.map((item, i) => (
                    <View key={i} style={i < pain_signals.length - 1 ? s.listItem : s.listItemLast}>
                      <View style={[s.dot, { backgroundColor: C.coral }]} />
                      <Text style={s.body}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* News — top 5 */}
        {(news?.length ?? 0) > 0 && (
          <View style={[s.card, { marginTop: 10 }]}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Recent news</Text></View>
            <View style={s.cardBody}>
              {news.slice(0, 5).map((item, i) => (
                <View key={i} style={i < Math.min(news.length, 5) - 1 ? s.newsItem : s.newsItemLast}>
                  <Text style={s.newsMeta}>{item.date}  ·  {item.source}</Text>
                  <Text style={s.newsText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Outreach angle */}
        {outreach_angle && (
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Outreach angle</Text></View>
            <View style={s.cardBody}><Text style={s.body}>{outreach_angle}</Text></View>
          </View>
        )}

        {/* Tech signals */}
        {(tech_signals?.length ?? 0) > 0 && (
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Tech signals</Text></View>
            <View style={[s.cardBody, { paddingVertical: 8 }]}>
              <View style={s.techRow}>
                {tech_signals.map((t, i) => (
                  <View key={i} style={s.techTag}><Text style={s.techTagTxt}>{t}</Text></View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Decision makers */}
        {dms.length > 0 && (
          <View style={[s.card, { marginBottom: 10 }]}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Decision makers</Text></View>
            <View style={[s.cardBody, { paddingTop: 8 }]}>
              {dms.map((dm, i) => {
                const roleColors = ROLE_COLORS[dm.role] ?? ROLE_COLORS.custom
                return (
                  <View key={i} style={[s.dmCard, i === dms.length - 1 ? { marginBottom: 0 } : {}]}>
                    <View style={s.dmHeader}>
                      <View style={[s.dmAvatar, { backgroundColor: dm.avatar_color_bg }]}>
                        <Text style={[s.dmInitials, { color: dm.avatar_color_text }]}>{dm.avatar_initials}</Text>
                      </View>
                      <View>
                        <Text style={s.dmName}>{dm.name ?? 'Unknown'}</Text>
                        <Text style={s.dmTitle}>{dm.title}</Text>
                      </View>
                    </View>
                    <View style={[s.dmRolePill, { backgroundColor: roleColors.bg }]}>
                      <Text style={[s.dmRoleText, { color: roleColors.text }]}>{dm.role_label}</Text>
                    </View>
                    {dm.cares_about && (
                      <>
                        <Text style={s.dmFieldLbl}>Cares about</Text>
                        <Text style={s.dmFieldVal}>{dm.cares_about}</Text>
                      </>
                    )}
                    {dm.suggested_angle && (
                      <>
                        <Text style={s.dmFieldLbl}>Suggested angle</Text>
                        <Text style={s.dmFieldVal}>{dm.suggested_angle}</Text>
                      </>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Email draft */}
        {email && (
          <View style={s.card}>
            <View style={s.cardHead}><Text style={s.cardLabel}>Suggested email</Text></View>
            <View style={s.cardBody}>
              {email.subject && <Text style={s.emailSubject}>Subject: {email.subject}</Text>}
              {email.body && <Text style={s.emailBody}>{email.body}</Text>}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>SalesLord · {prospectName} brief</Text>
          <Text style={s.footerTxt}>{exportedAt}</Text>
        </View>

      </Page>
    </Document>
  )
}

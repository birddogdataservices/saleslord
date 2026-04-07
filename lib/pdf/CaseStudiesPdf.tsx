// PDF document component for case study export.
// Lives in lib/ (not app/) so it can be imported by the route handler.
// Uses @react-pdf/renderer — server-side only.

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
  coverPage: {
    padding: 60,
    backgroundColor: '#18181A',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  coverLabel: {
    fontSize: 10,
    color: '#777777',
    letterSpacing: 2,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F0EDE6',
    marginBottom: 12,
  },
  coverDate: {
    fontSize: 11,
    color: '#888888',
  },
  slidePage: {
    backgroundColor: '#ffffff',
    padding: 0,
  },
  slideImage: {
    width: '100%',
    objectFit: 'contain',
  },
  slideFooter: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slideFooterText: {
    fontSize: 8,
    color: '#aaaaaa',
  },
})

type Slide = {
  imageUrl: string
  company: string | null
  outcome: string | null
}

type Props = {
  prospectName: string
  slides: Slide[]
  date: string
}

export default function CaseStudiesPdf({ prospectName, slides, date }: Props) {
  return (
    <Document>
      {/* Cover page */}
      <Page size="A4" orientation="landscape" style={styles.coverPage}>
        <Text style={styles.coverLabel}>CASE STUDIES</Text>
        <Text style={styles.coverTitle}>For {prospectName}</Text>
        <Text style={styles.coverDate}>{date}</Text>
      </Page>

      {/* One slide per page */}
      {slides.map((slide, i) => (
        <Page key={i} size="A4" orientation="landscape" style={styles.slidePage}>
          <Image src={slide.imageUrl} style={styles.slideImage} />
          <View style={styles.slideFooter}>
            <Text style={styles.slideFooterText}>
              {slide.company ?? ''}
            </Text>
            <Text style={styles.slideFooterText}>
              {i + 1} / {slides.length}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  )
}

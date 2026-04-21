export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TimingBar from '@/components/prospect/TimingBar'
import StatCards from '@/components/prospect/StatCards'
import NewsCard from '@/components/prospect/NewsCard'
import DecisionMakers from '@/components/prospect/DecisionMakers'
import RightColumn from '@/components/prospect/RightColumn'
import EmailDraftButton from '@/components/prospect/EmailDraftButton'
import CheckUpdatesButton from '@/components/prospect/CheckUpdatesButton'
import UpdateBlurbs from '@/components/prospect/UpdateBlurbs'
import ReresearchButton from '@/components/prospect/ReresearchButton'
import ArchiveButton from '@/components/prospect/ArchiveButton'
import type { ProspectBrief, DecisionMaker, ProspectNote, ProspectUpdate } from '@/lib/types'

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch all data in parallel
  const [prospectRes, briefRes, dmsRes, notesRes, updatesRes, caseStudyCountRes, productsRes] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', id).single(),
    supabase.from('prospect_briefs').select('*').eq('prospect_id', id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('decision_makers').select('*').eq('prospect_id', id).order('sort_order'),
    supabase.from('prospect_notes').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
    supabase.from('prospect_updates').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
    supabase.from('case_studies').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('id, name').order('created_at', { ascending: true }),
  ])

  if (!prospectRes.data) notFound()

  const prospect       = prospectRes.data
  const brief          = briefRes.data as ProspectBrief | null
  const dms            = (dmsRes.data ?? []) as DecisionMaker[]
  const notes          = (notesRes.data ?? []) as ProspectNote[]
  const updates        = (updatesRes.data ?? []) as ProspectUpdate[]
  const caseStudyCount = caseStudyCountRes.count ?? 0
  const products       = (productsRes.data ?? []) as { id: string; name: string }[]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Topbar */}
      <div
        className="flex items-center gap-4 px-6 py-3 flex-shrink-0"
        style={{ background: 'var(--sl-surface)', borderBottom: '1px solid var(--sl-border)' }}
      >
        {/* Company avatar */}
        <div
          className="w-[38px] h-[38px] rounded-[8px] flex items-center justify-center text-[15px] font-semibold flex-shrink-0"
          style={{ background: 'var(--sl-blue-bg)', color: 'var(--sl-blue-t)' }}
        >
          {prospect.name[0].toUpperCase()}
        </div>

        <div>
          <div className="text-[16px] font-semibold" style={{ color: 'var(--sl-text)' }}>
            {prospect.name}
          </div>
          {brief?.timing && (
            <div className="flex gap-2 text-[11px] mt-[2px]" style={{ color: 'var(--sl-text2)' }}>
              <span>FY ends {brief.timing.fy_end}</span>
              {brief.stats?.stage?.value && (
                <>
                  <span style={{ color: 'var(--sl-border)' }}>·</span>
                  <span>{brief.stats.stage.value}</span>
                </>
              )}
              {brief.stats?.hq_location && (
                <>
                  <span style={{ color: 'var(--sl-border)' }}>·</span>
                  <span>{brief.stats.hq_location}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex gap-[7px] items-center">
          <ArchiveButton
            prospectId={id}
            isArchived={!!prospect.archived_at}
            prospectName={prospect.name}
          />
          {brief && (
            <a
              href={`/api/export/pdf/${id}`}
              download
              className="text-[11px] px-3 py-[5px] rounded-[6px] font-medium"
              style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)', textDecoration: 'none' }}
            >
              Export PDF
            </a>
          )}
          {brief && (
            <CheckUpdatesButton prospectId={id} lastRefreshedAt={prospect.last_refreshed_at} />
          )}
          {brief?.email && (
            <EmailDraftButton initialEmail={brief.email} prospectId={id} products={products} />
          )}
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 py-[18px]">
        <div className="flex flex-col gap-[14px] max-w-[1200px]">

          {/* Timing bar — always first */}
          {brief?.timing && <TimingBar timing={brief.timing} />}

          {/* Stats */}
          {brief?.stats && <StatCards stats={brief.stats} />}

          {/* No brief yet — offer a direct re-trigger using the stored query */}
          {!brief && (
            <div
              className="rounded-[10px] px-6 py-8 text-center"
              style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
            >
              <p className="text-[13px] font-medium" style={{ color: 'var(--sl-text)' }}>No research yet</p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--sl-text2)' }}>
                Research may still be running, or it was interrupted. You can run it again below.
              </p>
              <ReresearchButton query={prospect.query} />
            </div>
          )}

          {/* Update blurbs — freshest intel on top, above original brief */}
          {updates.length > 0 && <UpdateBlurbs updates={updates} />}

          {brief && (
            <div className="grid gap-[14px]" style={{ gridTemplateColumns: '1fr 340px' }}>

              {/* LEFT column */}
              <div className="flex flex-col gap-[12px]">

                {/* Snapshot */}
                {brief.snapshot && (
                  <SCard title="Snapshot">
                    <div className="px-[14px] py-[12px]">
                      <p className="text-[12px] leading-[1.7]" style={{ color: '#444' }}>{brief.snapshot}</p>
                    </div>
                  </SCard>
                )}

                {/* Initiatives + Pain signals */}
                {((brief.initiatives?.length ?? 0) > 0 || (brief.pain_signals?.length ?? 0) > 0) && (
                  <div className="grid grid-cols-2 gap-[12px]">
                    {(brief.initiatives?.length ?? 0) > 0 && (
                      <SCard title="Strategic initiatives">
                        <div className="px-[14px] py-[8px]">
                          {brief.initiatives.map((item, i) => (
                            <div
                              key={i}
                              className="flex gap-[9px] items-start py-[7px]"
                              style={{ borderBottom: i < brief.initiatives.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
                            >
                              <div
                                className="w-[3px] rounded-[2px] flex-shrink-0 mt-[3px]"
                                style={{ height: 16, background: '#1D9E75' }}
                              />
                              <p className="text-[12px] leading-relaxed" style={{ color: '#333' }}>{item}</p>
                            </div>
                          ))}
                        </div>
                      </SCard>
                    )}
                    {(brief.pain_signals?.length ?? 0) > 0 && (
                      <SCard title="Pain signals">
                        <div className="px-[14px] py-[8px]">
                          {brief.pain_signals.map((item, i) => (
                            <div
                              key={i}
                              className="flex gap-[9px] items-start py-[7px]"
                              style={{ borderBottom: i < brief.pain_signals.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
                            >
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-[2px]"
                                style={{ background: 'var(--sl-coral-bg)' }}
                              >
                                <div className="w-[5px] h-[5px] rounded-full" style={{ background: '#D85A30' }} />
                              </div>
                              <p className="text-[12px] leading-relaxed" style={{ color: '#333' }}>{item}</p>
                            </div>
                          ))}
                        </div>
                      </SCard>
                    )}
                  </div>
                )}

                {/* News — above decision makers */}
                {(brief.news?.length ?? 0) > 0 && <NewsCard news={brief.news} />}

                {/* Decision makers */}
                {dms.length > 0 && <DecisionMakers decisionMakers={dms} />}
              </div>

              {/* RIGHT column — 340px fixed */}
              <RightColumn
                brief={brief}
                dms={dms}
                notes={notes}
                prospectId={id}
                prospectName={prospect.name}
                caseStudyCount={caseStudyCount}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
      <div className="px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text2)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

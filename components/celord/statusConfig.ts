import type { CustomerStatus } from '@/core/types'

// Single source of truth for CELord status display.
// Imported by OrgStatusActions, ProspectsTable, and the org detail page.

export const STATUS_OPTIONS: { value: CustomerStatus; label: string; cls: string }[] = [
  { value: 'prospect',                     label: 'Prospect',         cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { value: 'active_customer',              label: 'Customer',         cls: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { value: 'former_customer',              label: 'Former customer',  cls: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  { value: 'failed_enterprise_conversion', label: 'Failed conv.',     cls: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { value: 'lead_created_in_crm',          label: 'Lead in CRM',     cls: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  { value: 'irrelevant',                   label: 'Irrelevant',       cls: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { value: 'do_not_contact',               label: 'Do not contact',   cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { value: 'unknown',                      label: 'Clear status',     cls: 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-200' },
]

// Badge display — used in table rows and detail page header/history.
// unknown has empty label/cls so callers can choose whether to render it.
export const STATUS_BADGE: Record<CustomerStatus, { label: string; cls: string }> = {
  prospect:                     { label: 'Prospect',        cls: 'bg-blue-100 text-blue-700' },
  active_customer:              { label: 'Customer',        cls: 'bg-green-100 text-green-700' },
  former_customer:              { label: 'Former',          cls: 'bg-gray-100 text-gray-600' },
  failed_enterprise_conversion: { label: 'Failed conv.',    cls: 'bg-orange-100 text-orange-700' },
  lead_created_in_crm:          { label: 'Lead in CRM',    cls: 'bg-purple-100 text-purple-700' },
  irrelevant:                   { label: 'Irrelevant',      cls: 'bg-yellow-100 text-yellow-700' },
  do_not_contact:               { label: 'Do not contact',  cls: 'bg-red-100 text-red-700' },
  unknown:                      { label: '',                cls: '' },
}

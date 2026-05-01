declare module 'react-simple-maps' {
  import { CSSProperties, ReactNode, SVGProps } from 'react'

  export interface GeoFeature {
    rsmKey: string
    properties: Record<string, unknown>
    geometry: unknown
  }

  export interface GeographiesChildrenProps {
    geographies: GeoFeature[]
  }

  export interface ComposableMapProps {
    projection?: string
    projectionConfig?: Record<string, unknown>
    style?: CSSProperties
    width?: number
    height?: number
    children?: ReactNode
  }

  export interface GeographiesProps {
    geography: string | Record<string, unknown>
    children: (props: GeographiesChildrenProps) => ReactNode
  }

  export interface GeographyStyle {
    fill?: string
    stroke?: string
    strokeWidth?: number
    outline?: string
    cursor?: string
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: GeoFeature
    style?: {
      default?: GeographyStyle
      hover?: GeographyStyle
      pressed?: GeographyStyle
    }
    onClick?: (event: React.MouseEvent<SVGPathElement>) => void
    title?: string
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element
  export function Geographies(props: GeographiesProps): JSX.Element
  export function Geography(props: GeographyProps): JSX.Element
}

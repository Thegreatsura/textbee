import { describe, expect, it, vi } from 'vitest'
import { forwardRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import DeviceList from './device-list'
import type { Device } from '@/lib/api'

const MINUTE_MS = 60 * 1000
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE_MS).toISOString()

let devices: Device[] = []

vi.mock('@/lib/api', () => ({
  useDevices: () => ({ isPending: false, error: null, data: devices, refetch: vi.fn() }),
  useSubscription: () => ({ data: undefined }),
  useDeleteDevice: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDefaultDevice: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('./add-device-dialog', () => {
  const AddDeviceDialog = forwardRef(() => null)
  AddDeviceDialog.displayName = 'AddDeviceDialog'
  return { default: AddDeviceDialog }
})

const device = (over: Partial<Device>): Device =>
  ({
    _id: 'device_1',
    brand: 'Google',
    model: 'Pixel 8',
    enabled: true,
    createdAt: ago(60 * 24 * 30),
    ...over,
  }) as Device

const row = (name: RegExp) =>
  screen.getByRole('heading', { name }).closest('div.min-w-0.flex-1') as HTMLElement

describe('DeviceList presence', () => {
  it('shows a recently seen device as online with its last-seen time', () => {
    devices = [device({ lastHeartbeat: ago(5) })]
    render(<DeviceList />)

    const r = row(/Pixel 8/)
    expect(within(r).getByText('Online')).toBeInTheDocument()
    expect(within(r).getByText(/Last seen/)).toHaveTextContent('Last seen 5 minutes ago')
  })

  it('shows a silent device as offline', () => {
    devices = [device({ lastHeartbeat: ago(60 * 5) })]
    render(<DeviceList />)

    expect(within(row(/Pixel 8/)).getByText('Offline')).toBeInTheDocument()
  })

  it('keeps disabled devices labelled as disabled', () => {
    devices = [device({ enabled: false, lastHeartbeat: ago(1) })]
    render(<DeviceList />)

    const r = row(/Pixel 8/)
    expect(within(r).getByText('Disabled')).toBeInTheDocument()
    expect(within(r).queryByText('Online')).not.toBeInTheDocument()
  })

  it('asks an older build without heartbeats to update instead of claiming offline', () => {
    devices = [device({ lastHeartbeat: null, appVersionCode: 1 })]
    render(<DeviceList />)

    const r = row(/Pixel 8/)
    expect(within(r).getByText('Enabled')).toBeInTheDocument()
    expect(within(r).queryByText('Offline')).not.toBeInTheDocument()
    expect(within(r).queryByText(/Last seen/)).not.toBeInTheDocument()
    expect(within(r).getByText('Update the app to see online status')).toBeInTheDocument()
  })

  it('shows no update hint for a current build that has not reported yet', () => {
    devices = [device({ lastHeartbeat: null, appVersionCode: 9999 })]
    render(<DeviceList />)

    const r = row(/Pixel 8/)
    expect(within(r).getByText('Enabled')).toBeInTheDocument()
    expect(
      within(r).queryByText('Update the app to see online status')
    ).not.toBeInTheDocument()
  })
})

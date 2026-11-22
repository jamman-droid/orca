import type { BrowserWindow } from 'electron'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions,
  UpdateStatus
} from '../../shared/updater/update-status-types'
import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../../shared/remote-runtime/host-catalog/remote-server-update'
import type { ReleaseBuild, ReleaseChannel } from '../../shared/updater/release-channel'
import type { ReleaseBuildListOptions } from './releases/updater-release-build-cache'
import { UpdaterSetup, type UpdaterSetupOptions } from './lifecycle/updater-setup'
import type { UpdateInstallMode } from './lifecycle/updater-state'

const updater = new UpdaterSetup()

// Fork updates are deployed from reviewed source; upstream binaries must never replace this runtime.
const FORK_UPDATES_DISABLED = true
function assertForkUpdatesEnabled(): void {
  if (FORK_UPDATES_DISABLED) {
    throw new Error('Orca Factory updates are managed from its source checkout.')
  }
}

export function resolveUpdateInstallMode(isServeMode: boolean): UpdateInstallMode {
  return updater.resolveUpdateInstallMode(isServeMode)
}

export function getUpdateStatus(): UpdateStatus {
  return updater.getUpdateStatus()
}

export function getRemoteServerUpdateSupport(): RemoteServerUpdateSupport {
  return updater.getRemoteServerUpdateSupport()
}

export function getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot {
  return updater.getRemoteServerUpdaterSnapshot(runtimeId)
}

export function checkForRemoteServerUpdate(
  runtimeId: string,
  options?: UpdateCheckOptions
): RemoteServerUpdaterSnapshot {
  assertForkUpdatesEnabled()
  return updater.checkForRemoteServerUpdate(runtimeId, options)
}

export function downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot {
  assertForkUpdatesEnabled()
  return updater.downloadRemoteServerUpdate(runtimeId)
}

export function installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult {
  assertForkUpdatesEnabled()
  return updater.installRemoteServerUpdate(runtimeId)
}

export function checkForUpdates(): void {
  if (FORK_UPDATES_DISABLED) {
    return
  }
  updater.checkForUpdates()
}

export function checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
  if (FORK_UPDATES_DISABLED) {
    return
  }
  updater.checkForUpdatesFromMenu(options)
}

export function applyAutomaticUpdatesSetting(enabled: boolean | undefined): void {
  if (!FORK_UPDATES_DISABLED && enabled === true) {
    updater.applyAutomaticUpdatesSetting()
  }
}

export function downloadUpdate(): void {
  assertForkUpdatesEnabled()
  updater.downloadUpdate()
}

export function quitAndInstall(): void {
  assertForkUpdatesEnabled()
  updater.quitAndInstall()
}

export function isQuittingForUpdate(): boolean {
  return updater.isQuittingForUpdate()
}

export async function getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
  assertForkUpdatesEnabled()
  return updater.getLinuxPackageInstallInstructions()
}

export async function showLinuxPackage(): Promise<void> {
  assertForkUpdatesEnabled()
  return updater.showLinuxPackage()
}

export async function listAvailableReleaseBuilds(
  channel: ReleaseChannel,
  options?: ReleaseBuildListOptions
): Promise<ReleaseBuild[]> {
  if (FORK_UPDATES_DISABLED) {
    return []
  }
  return updater.listAvailableReleaseBuilds(channel, options)
}

export function dismissNudge(): void {
  updater.dismissNudge()
}

export function dismissAvailableUpdate(): void {
  updater.dismissAvailableUpdate()
}

export function setupAutoUpdater(
  mainWindow: BrowserWindow | null,
  opts?: UpdaterSetupOptions
): void {
  if (FORK_UPDATES_DISABLED) {
    return
  }
  updater.setupAutoUpdater(mainWindow, opts)
}

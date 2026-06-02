package tokenusage

import "context"

type HourlyUsageSyncState struct {
	TotalRows            int
	DirtyRows            int
	LastSuccessfulSyncAt int64
}

type HourlyUsageRepository interface {
	ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []HourlyUsageRow) error
	ListDirtyHourlyRows(ctx context.Context) ([]HourlyUsageRow, error)
	MarkHourlyRowsSynced(ctx context.Context, rows []HourlyUsageRow, syncedAt int64) error
	GetHourlyUsageSyncState(ctx context.Context) (HourlyUsageSyncState, error)
}

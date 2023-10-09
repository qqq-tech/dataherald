import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { Toaster } from '@/components/ui/toaster'
import { TreeNode, TreeView } from '@/components/ui/tree-view'
import { useTree } from '@/components/ui/tree-view-context'
import { toast } from '@/components/ui/use-toast'
import useSynchronizeSchemas from '@/hooks/api/useSynchronizeSchemas'
import {
  formatTableSyncStatus,
  getDomainTableSyncStatusColors,
  getDomainTableSyncStatusIcon,
  isSelectableByStatus,
} from '@/lib/domain/database'
import { cn, renderIcon } from '@/lib/utils'
import { Databases, ETableSyncStatus } from '@/models/api'
import { formatDistanceStrict } from 'date-fns'
import {
  Columns,
  DatabaseIcon,
  Loader,
  RefreshCw,
  Table2,
  UploadCloud,
} from 'lucide-react'
import { FC, useMemo, useState } from 'react'

const mapDatabaseToTreeData = (databases: Databases): TreeNode =>
  databases.map((database) => ({
    id: database.db_connection_id,
    name: database.alias,
    icon: DatabaseIcon,
    selectable: database.tables.some((table) =>
      isSelectableByStatus(table.sync_status),
    ),
    defaultOpen: true,
    children: [
      {
        name: 'Tables',
        id: 'tables-root',
        icon: Table2,
        defaultOpen: true,
        children: database.tables.map((table) => ({
          id: table.name,
          name: table.name,
          icon: Table2,
          selectable: isSelectableByStatus(table.sync_status),
          slot: (
            <div
              className={cn(
                'flex items-center gap-3 min-w-fit px-5',
                getDomainTableSyncStatusColors(table.sync_status).text,
              )}
            >
              {table.last_sync && (
                <span className="text-gray-400">
                  {formatDistanceStrict(new Date(table.last_sync), new Date(), {
                    addSuffix: true,
                  })}
                </span>
              )}
              {renderIcon(getDomainTableSyncStatusIcon(table.sync_status), {
                size: 16,
                strokeWidth: 2,
              })}
              {formatTableSyncStatus(table.sync_status)}
            </div>
          ),
          children: table.columns?.length
            ? [
                {
                  id: 'columns-root',
                  name: 'Columns',
                  icon: Columns,
                  children: table.columns.map((column) => ({
                    id: column,
                    name: column,
                    icon: Columns,
                  })),
                },
              ]
            : [],
        })),
      },
    ],
  }))[0] // TODO: Fix this when we support multiple databases

interface DatabaseDetailsProps {
  databases: Databases
  isRefreshing: boolean
  onRefresh: (newData?: Databases) => Promise<void>
}

const DatabaseDetails: FC<DatabaseDetailsProps> = ({
  databases,
  isRefreshing,
  onRefresh,
}) => {
  const [isSynchronizing, setIsSynchronizing] = useState(false)
  const { selectedNodes, resetSelection } = useTree()
  const synchronizeSchemas = useSynchronizeSchemas()
  const databaseTree = useMemo(
    () => (databases.length > 0 ? mapDatabaseToTreeData(databases) : null),
    [databases],
  )

  if (databaseTree === null) return <></>

  const resetSyncSelection = resetSelection

  const handleSynchronization = async () => {
    setIsSynchronizing(true)
    const optimisticDatabaseUpdate = databases.map((db) => ({
      ...db,
      tables: db.tables.map((t) => ({
        ...t,
        ...(selectedNodes.has(t.name)
          ? {
              sync_status: ETableSyncStatus.SYNCHRONIZING,
              last_sync: null,
            }
          : {}),
      })),
    }))
    try {
      await synchronizeSchemas({
        db_connection_id: databaseTree.id,
        table_names: Array.from(selectedNodes),
      })
      toast({
        variant: 'success',
        title: 'Synchronization queued',
        description: `${selectedNodes.size} tables schemas were succesfully queued for synchronization.`,
      })
      setIsSynchronizing(false)
      resetSyncSelection()
      try {
        await onRefresh(optimisticDatabaseUpdate)
      } catch (e) {
        console.error(e)
        toast({
          variant: 'destructive',
          title: 'Ups! Something went wrong.',
          description: 'There was a problem refreshing your Database.',
          action: (
            <ToastAction
              altText="Try again"
              onClick={() => handleSynchronization()}
            >
              Try again
            </ToastAction>
          ),
        })
      }
    } catch (e) {
      console.error(e)
      toast({
        variant: 'destructive',
        title: 'Ups! Something went wrong.',
        description:
          'There was a problem synchronizing your Database tables schemas.',
        action: (
          <ToastAction altText="Try again" onClick={handleSynchronization}>
            Try again
          </ToastAction>
        ),
      })
    } finally {
      setIsSynchronizing(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between bg-gray-50 py-0">
        <h1 className="font-bold">Connected Database</h1>
        <div className="flex gap-3">
          <Button
            disabled={
              isSynchronizing || isRefreshing || selectedNodes.size === 0
            }
            onClick={handleSynchronization}
          >
            {isSynchronizing ? (
              <Loader size={18} className="mr-2 animate-spin" />
            ) : (
              <UploadCloud size={18} className="mr-2" />
            )}
            {`${isSynchronizing ? `Synchronizing` : 'Synchronize'} ${
              selectedNodes.size
            } tables schemas`}
          </Button>
          <Button
            variant="outline"
            className="bg-gray-50"
            disabled={isRefreshing || isSynchronizing}
            onClick={() => onRefresh()}
          >
            <RefreshCw
              size={18}
              className={cn('mr-2', isRefreshing ? 'animate-spin' : '')}
            />{' '}
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      <TreeView rootNode={databaseTree} />
      <Toaster />
    </>
  )
}

export default DatabaseDetails
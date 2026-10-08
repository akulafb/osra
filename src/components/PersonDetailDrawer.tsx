import React, { useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  IconButton, 
  Drawer,
  useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { FamilyNode, FamilyLink } from '../types/graph';
import { canManageInvites } from '../lib/permissions';
import { useCanvasMode } from '../hooks/useCanvasMode';
import type { Database } from '../types/database';
import { SHEET_MAX_HEIGHT_VH, SIDE_DRAWER_WIDTH_PX, useIsDrawerSheet } from '../hooks/usePersonDrawerInset';

type UserProfile = Database['public']['Tables']['users']['Row'];

interface PersonDetailDrawerProps {
  selectedNode: FamilyNode | null;
  onClose: () => void;
  /**
   * Step aside without dropping the selection. On a phone or tablet the
   * drawer covers most of the canvas, so it has to leave while the canvas is
   * being asked something (LIN-62).
   */
  hidden?: boolean;
  canEditSelected: boolean;
  isAdmin: boolean;
  userProfile: UserProfile | null;
  /**
   * The *confirmed* Kinship Links. An affordance derived from a pending link
   * is an affordance for a write the server refuses (LIN-58's D13).
   */
  confirmedLinks: readonly FamilyLink[];
  onEdit: () => void;
  onAdd: () => void;
  onInvite: () => void;
  /** Without it Connect Nodes is not offered. */
  onConnect?: () => void;
  onManageLinks: () => void;
  onDelete: () => void;
}

export const PersonDetailDrawer: React.FC<PersonDetailDrawerProps> = ({
  selectedNode,
  onClose,
  hidden = false,
  canEditSelected,
  isAdmin,
  userProfile,
  confirmedLinks,
  onEdit,
  onAdd,
  onInvite,
  onConnect,
  onManageLinks,
  onDelete,
}) => {
  const { panel } = useTheme().palette;
  const isSheet = useIsDrawerSheet();

  const { setFocusedPerson } = useCanvasMode();
  const hasPerson = !!selectedNode;
  const familyCluster = selectedNode?.familyCluster;
  useEffect(() => {
    setFocusedPerson(hasPerson ? { familyCluster } : null);
  }, [hasPerson, familyCluster, setFocusedPerson]);

  if (!selectedNode) return null;

  const showInvite = canManageInvites(
    selectedNode.id, 
    userProfile?.node_id, 
    userProfile?.role === 'admin', 
    confirmedLinks
  );

  return (
    <Drawer
      anchor={isSheet ? 'bottom' : 'right'}
      open={!!selectedNode && !hidden}
      onClose={onClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          width: isSheet ? '100%' : SIDE_DRAWER_WIDTH_PX,
          background: panel.surface.drawer,
          backdropFilter: 'blur(24px)',
          ...(isSheet
            ? {
                maxHeight: `${SHEET_MAX_HEIGHT_VH}vh`,
                borderTop: `1px solid ${panel.border.accent}`,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                boxShadow: `0 -10px 40px ${panel.shadow.floating}`,
              }
            : {
                borderLeft: `1px solid ${panel.border.accent}`,
                boxShadow: `-10px 0 40px ${panel.shadow.floating}`,
              }),
          color: panel.role.text,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }
      }}
    >
      {/* Header */}
      <Box sx={{ p: isSheet ? 2 : 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography 
            variant="h4" 
            sx={{ 
              fontFamily: '"Lora", serif', 
              color: panel.ink.strong,
              mb: 0.5
            }}
          >
            {selectedNode.firstName}
          </Typography>
          {selectedNode.familyCluster && (
            <Typography 
              variant="overline" 
              sx={{ 
                color: panel.role.primary,
                letterSpacing: '0.1em',
                fontWeight: 600
              }}
            >
              {selectedNode.familyCluster} Family
            </Typography>
          )}
        </Box>
        <IconButton aria-label="Close details" onClick={onClose} sx={{ color: panel.ink.faint, '&:hover': { color: panel.ink.strong } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, px: isSheet ? 2 : 3, pt: isSheet ? 0 : 2, pb: 2, overflowY: 'auto' }}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontFamily: 'monospace', 
            color: panel.ink.ghost,
            display: 'block',
            mb: isSheet ? 2 : 4
          }}
        >
          ID: {selectedNode.id}
        </Typography>

        {/* Action Grid */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {canEditSelected && (
            <>
              <Button 
                variant="contained" 
                fullWidth
                onClick={onEdit}
                sx={{ 
                  background: panel.fill.accent,
                  color: panel.ink.onAccent,
                  fontWeight: 700,
                  '&:hover': { background: panel.fill.accentHover }
                }}
              >
                Edit Registry
              </Button>
              <Button 
                variant="outlined" 
                fullWidth
                onClick={onAdd}
                sx={{ 
                  borderColor: panel.role.secondary,
                  color: panel.role.secondary,
                  '&:hover': { borderColor: panel.role.secondaryLight, background: panel.tint.secondaryHover }
                }}
              >
                + Add Relative
              </Button>
              {showInvite && (
                <Button 
                  variant="outlined" 
                  fullWidth
                  onClick={onInvite}
                  sx={{ 
                    borderColor: panel.role.success,
                    color: panel.role.success,
                    '&:hover': { borderColor: panel.role.successLight, background: panel.tint.successHover }
                  }}
                >
                  Invite to Tree
                </Button>
              )}
            </>
          )}

          {isAdmin && (
            <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${panel.border.hairline}` }}>
              <Typography variant="caption" sx={{ color: panel.ink.ghost, mb: 1, display: 'block', textTransform: 'uppercase' }}>
                Administrative Tools
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {onConnect && (
                  <Button 
                    variant="text" 
                    fullWidth
                    onClick={onConnect}
                    sx={{ justifyContent: 'flex-start', color: panel.role.textSecondary }}
                  >
                    Connect Nodes...
                  </Button>
                )}
                <Button 
                  variant="text" 
                  fullWidth
                  onClick={onManageLinks}
                  sx={{ justifyContent: 'flex-start', color: panel.role.textSecondary }}
                >
                  Manage Links
                </Button>
                <Button 
                  variant="text" 
                  fullWidth
                  onClick={onDelete}
                  sx={{ justifyContent: 'flex-start', color: panel.role.error }}
                >
                  Delete Entry
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

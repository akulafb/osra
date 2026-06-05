import React from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  IconButton, 
  Drawer,
  useTheme,
  alpha
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { FamilyNode, FamilyLink } from '../types/graph';
import { canManageInvites } from '../lib/permissions';

interface PersonDetailDrawerProps {
  selectedNode: FamilyNode | null;
  onClose: () => void;
  canEditSelected: boolean;
  isAdmin: boolean;
  userProfile: any;
  graphData: any;
  onEdit: () => void;
  onAdd: () => void;
  onInvite: () => void;
  onConnect: () => void;
  onManageLinks: () => void;
  onDelete: () => void;
}

export const PersonDetailDrawer: React.FC<PersonDetailDrawerProps> = ({
  selectedNode,
  onClose,
  canEditSelected,
  isAdmin,
  userProfile,
  graphData,
  onEdit,
  onAdd,
  onInvite,
  onConnect,
  onManageLinks,
  onDelete,
}) => {
  const theme = useTheme();

  if (!selectedNode) return null;

  const showInvite = canManageInvites(
    selectedNode.id, 
    userProfile?.node_id, 
    userProfile?.role === 'admin', 
    (graphData?.links ?? []) as FamilyLink[]
  );

  return (
    <Drawer
      anchor="right"
      open={!!selectedNode}
      onClose={onClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 400 },
          background: 'rgba(5, 5, 5, 0.75)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(212, 175, 55, 0.2)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
          color: 'text.primary',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }
      }}
    >
      {/* Header */}
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography 
            variant="h4" 
            sx={{ 
              fontFamily: '"Lora", serif', 
              color: 'white',
              mb: 0.5
            }}
          >
            {selectedNode.firstName}
          </Typography>
          {selectedNode.familyCluster && (
            <Typography 
              variant="overline" 
              sx={{ 
                color: 'primary.main',
                letterSpacing: '0.1em',
                fontWeight: 600
              }}
            >
              {selectedNode.familyCluster} Family
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'white' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, px: 3, py: 2, overflowY: 'auto' }}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontFamily: 'monospace', 
            color: 'rgba(255,255,255,0.3)',
            display: 'block',
            mb: 4
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
                  background: 'linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)',
                  color: 'black',
                  fontWeight: 700,
                  '&:hover': { background: 'linear-gradient(135deg, #F0E68C 0%, #D4AF37 100%)' }
                }}
              >
                Edit Registry
              </Button>
              <Button 
                variant="outlined" 
                fullWidth
                onClick={onAdd}
                sx={{ 
                  borderColor: 'secondary.main',
                  color: 'secondary.main',
                  '&:hover': { borderColor: 'secondary.light', background: alpha(theme.palette.secondary.main, 0.1) }
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
                    borderColor: 'success.main',
                    color: 'success.main',
                    '&:hover': { borderColor: 'success.light', background: alpha(theme.palette.success.main, 0.1) }
                  }}
                >
                  Invite to Tree
                </Button>
              )}
            </>
          )}

          {isAdmin && (
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mb: 1, display: 'block', textTransform: 'uppercase' }}>
                Administrative Tools
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button 
                  variant="text" 
                  fullWidth
                  onClick={onConnect}
                  sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}
                >
                  Connect Nodes...
                </Button>
                <Button 
                  variant="text" 
                  fullWidth
                  onClick={onManageLinks}
                  sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}
                >
                  Manage Links
                </Button>
                <Button 
                  variant="text" 
                  fullWidth
                  onClick={onDelete}
                  sx={{ justifyContent: 'flex-start', color: 'error.main' }}
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

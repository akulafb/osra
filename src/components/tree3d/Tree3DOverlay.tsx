import React, { useEffect, useState } from 'react';
import { useSpring, animated } from 'react-spring';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme } from '@mui/material/styles';
import { FamilyGraph, FamilyNode } from '../../types/graph';
import { useAuth } from '../../contexts/AuthContext';
import { getNodeId } from '../../lib/familyGraph';
import { CanvasModeSwitch } from '../CanvasModeSwitch';
import { TreeSearchBar } from '../TreeSearchBar';
import { bottomRightControlsClear, topRightControlsClear, type PersonDrawerInset } from '../../hooks/usePersonDrawerInset';

function SettingsPanelSpring({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const spring = useSpring({
    maxHeight: isOpen ? 800 : 0,
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });
  return (
    <animated.div style={{ ...spring, overflow: 'hidden', flexShrink: 0 }}>
      {children}
    </animated.div>
  );
}

export function TextureMenuSpring({
  isOpen,
  children,
  maxHeightOpen = 200,
}: {
  isOpen: boolean;
  children: React.ReactNode;
  maxHeightOpen?: number;
}) {
  const spring = useSpring({
    maxHeight: isOpen ? maxHeightOpen : 0,
    opacity: isOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });
  return (
    <animated.div style={{ ...spring, overflow: 'hidden' }}>
      {children}
    </animated.div>
  );
}

export interface Tree3DSceneCamera {
  focusPerson: (nodeId: string) => void;
  resetView: () => void;
}

export interface Tree3DSearch {
  query: string;
  onQueryChange: (q: string) => void;
  matches: FamilyNode[];
  currentIndex: number;
  /** Without these the previous and next match buttons are hidden; the count and highlight stay. */
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  disabled: boolean;
}

const noop = () => {};

const HIDE_MATCH_STEPPING = {
  '& [aria-label="Previous match"], & [aria-label="Next match"]': { display: 'none' },
};

export interface Tree3DOverlayProps {
  graphData: FamilyGraph;
  camera: Tree3DSceneCamera;
  drawerInset: PersonDrawerInset;
  isMobileDevice: boolean;
  mode?: '3D' | '2D';
  onModeChange?: (mode: '3D' | '2D') => void;
  isAdmin: boolean;
  onAdminAddPersonClick?: () => void;
  /** Without these the AMBIANCE toggle is hidden. */
  isAmbienceOn?: boolean;
  onAmbienceChange?: (on: boolean) => void;
  showNames: boolean;
  onShowNamesChange: (on: boolean) => void;
  showLinks: boolean;
  onShowLinksChange: (on: boolean) => void;
  showArrows: boolean;
  onShowArrowsChange: (on: boolean) => void;
  search?: Tree3DSearch;
  searchOpenRequested: number;
  collapsedNodes: Set<string>;
  onSetCollapsedNodes: (nodes: Set<string>) => void;
  visibleClusters3D: Set<string>;
  onVisibleClusters3DChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  uniqueClusters: string[];
  onEnsureClusterVisible3D: (cluster: string) => void;
  instrumentsSceneItems?: React.ReactNode;
  navKeys: React.ReactNode;
  /** Optional "See who's new!" control; rendered above NAV CONTROLS, same column */
  seeWhosNewButtonSlot?: React.ReactNode;
}

export function Tree3DOverlay({
  graphData,
  camera,
  drawerInset,
  isMobileDevice,
  mode,
  onModeChange,
  isAdmin,
  onAdminAddPersonClick,
  isAmbienceOn,
  onAmbienceChange,
  showNames,
  onShowNamesChange,
  showLinks,
  onShowLinksChange,
  showArrows,
  onShowArrowsChange,
  search,
  searchOpenRequested,
  collapsedNodes,
  onSetCollapsedNodes,
  visibleClusters3D,
  onVisibleClusters3DChange,
  uniqueClusters,
  onEnsureClusterVisible3D,
  instrumentsSceneItems,
  navKeys,
  seeWhosNewButtonSlot,
}: Tree3DOverlayProps) {
  const { userProfile } = useAuth();
  const { panel } = useTheme().palette;

  const [showControls, setShowControls] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [showNavControls, setShowNavControls] = useState(false);

  useEffect(() => {
    if (isMobileDevice) setShowNavControls(false);
  }, [isMobileDevice]);

  // Expand settings when Ctrl+F opens search
  useEffect(() => {
    if (searchOpenRequested > 0) {
      setShowControls(true);
    }
  }, [searchOpenRequested]);

  const searchBar = search && (
    <TreeSearchBar
      query={search.query}
      onQueryChange={search.onQueryChange}
      matches={search.matches}
      currentIndex={search.currentIndex}
      onPrev={search.onPrev ?? noop}
      onNext={search.onNext ?? noop}
      onClose={search.onClose}
      disabled={search.disabled}
      embedded
      focusTrigger={searchOpenRequested}
    />
  );

  return (
    <>
      {/* Settings Controls - Top Right */}
      <div style={{ position: 'absolute', ...topRightControlsClear(drawerInset), display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 1300, alignItems: 'flex-end' }}>
        {/* Settings Toggle - First */}
        <Button
          variant="contained"
          onClick={() => setShowControls(!showControls)}
          sx={{
            minWidth: '140px',
            background: panel.surface.toggle,
            backdropFilter: 'blur(24px)',
            border: `1px solid ${panel.border.accent}`,
            color: panel.role.primary,
            fontWeight: 700,
            letterSpacing: '0.05em',
            '&:hover': {
              background: panel.surface.toggleHover,
              borderColor: panel.border.accentHover,
            }
          }}
        >
          INSTRUMENTS {showControls ? '▴' : '▾'}
        </Button>

        {/* Ambiance Toggle - Floating slightly below button */}
        {onAmbienceChange && <Box sx={{
          background: panel.surface.pill,
          backdropFilter: 'blur(12px)',
          px: 1.5,
          py: 0.5,
          borderRadius: '20px',
          border: `1px solid ${panel.border.hairline}`
        }}>
          <FormControlLabel
            control={
              <Switch
                checked={!!isAmbienceOn}
                onChange={() => onAmbienceChange(!isAmbienceOn)}
                color="success"
                size="small"
              />
            }
            label="AMBIANCE"
            sx={{
              m: 0,
              color: panel.ink.muted,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.1em'
              }
            }}
          />
        </Box>}

        <SettingsPanelSpring isOpen={showControls}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '220px',
            backgroundColor: panel.surface.panel,
            backdropFilter: 'blur(24px)',
            padding: '20px',
            borderRadius: '12px',
            border: `1px solid ${panel.border.accent}`,
            boxShadow: `0 20px 50px ${panel.shadow.raised}`
          }}>
            {userProfile?.node_id && (
              <Button
                variant="contained"
                fullWidth
                size="small"
                onClick={() => {
                  const meNode = graphData?.nodes?.find((n) => n.id === userProfile.node_id);
                  const c = meNode?.familyCluster || meNode?.maternalFamilyCluster;
                  if (c) onEnsureClusterVisible3D(c);
                  camera.focusPerson(userProfile.node_id!);
                }}
                sx={{
                  background: panel.fill.findMe,
                  fontWeight: 700,
                  letterSpacing: '0.05em'
                }}
              >
                FIND ME
              </Button>
            )}

            {isAdmin && onAdminAddPersonClick && (
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={onAdminAddPersonClick}
                sx={{
                  color: panel.role.secondary,
                  borderColor: panel.role.secondary,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  '&:hover': { borderColor: panel.role.secondaryLight, background: panel.tint.secondary }
                }}
              >
                + ADD PERSON
              </Button>
            )}

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant={mode === '3D' ? "contained" : "outlined"}
                size="small"
                onClick={() => onModeChange?.('3D')}
                sx={{ flex: 1, fontSize: '0.7rem', fontWeight: 700 }}
              >
                3D
              </Button>
              <Button
                variant={mode === '2D' ? "contained" : "outlined"}
                size="small"
                onClick={() => onModeChange?.('2D')}
                sx={{ flex: 1, fontSize: '0.7rem', fontWeight: 700 }}
              >
                2D
              </Button>
            </Box>

            <Button
              variant="text"
              size="small"
              onClick={() => camera.resetView()}
              sx={{ color: panel.ink.faint, fontSize: '0.7rem', fontWeight: 600 }}
            >
              RESET VIEWPORT
            </Button>

            <CanvasModeSwitch />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <FormControlLabel
                control={<Switch checked={showNames} onChange={() => onShowNamesChange(!showNames)} color="primary" size="small" />}
                label="LABELS"
                sx={{ m: 0, color: panel.role.text, '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
              <FormControlLabel
                control={<Switch checked={showLinks} onChange={() => onShowLinksChange(!showLinks)} color="primary" size="small" />}
                label="LINKS"
                sx={{ m: 0, color: panel.role.text, '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
              <FormControlLabel
                control={<Switch checked={showArrows} onChange={() => onShowArrowsChange(!showArrows)} color="primary" size="small" />}
                label="ARROWS"
                sx={{ m: 0, color: panel.role.text, '& .MuiFormControlLabel-label': { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' } }}
              />
            </Box>

            {search && (
              <Box sx={{
                mt: 1,
                p: 1.5,
                backgroundColor: panel.surface.inset,
                borderRadius: '8px',
                border: `1px solid ${panel.border.hairline}`
              }}>
                <Typography variant="caption" sx={{ color: panel.role.primary, fontWeight: 700, letterSpacing: '0.1em', mb: 1, display: 'block', fontSize: '0.6rem' }}>
                  SEARCH ARCHIVE
                </Typography>
                {search.onPrev && search.onNext ? searchBar : <Box sx={HIDE_MATCH_STEPPING}>{searchBar}</Box>}
              </Box>
            )}

            <Button
              variant="outlined"
              color={collapsedNodes.size > 0 ? "primary" : "inherit"}
              size="small"
              fullWidth
              onClick={() => {
                if (collapsedNodes.size > 0) {
                  onSetCollapsedNodes(new Set());
                } else {
                  const parents = new Set<string>();
                  graphData?.links.forEach(l => {
                    if (l.type === 'parent') {
                      const sId = getNodeId(l.source);
                      parents.add(sId);
                    }
                  });
                  onSetCollapsedNodes(parents);
                }
              }}
              sx={{ mt: 1, fontSize: '0.65rem', fontWeight: 700, borderColor: panel.border.subtle }}
            >
              {collapsedNodes.size > 0 ? 'EXPAND ALL' : 'COLLAPSE ALL'}
            </Button>

            {instrumentsSceneItems}

            <div>
              <Button
                variant="text"
                size="small"
                fullWidth
                onClick={() => setIsVisibilityOpen(!isVisibilityOpen)}
                sx={{ justifyContent: 'space-between', color: panel.ink.muted, fontSize: '0.7rem' }}
              >
                VISIBILITY {isVisibilityOpen ? '▴' : '▾'}
              </Button>
              <TextureMenuSpring isOpen={isVisibilityOpen} maxHeightOpen={300}>
                <Box sx={{ mt: 0.5, backgroundColor: panel.surface.well, borderRadius: '4px', overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1, borderBottom: `1px solid ${panel.border.hairline}` }}>
                    <Button size="small" sx={{ fontSize: '0.6rem', minWidth: 0 }} onClick={() => onVisibleClusters3DChange(new Set(uniqueClusters))}>ALL</Button>
                    <Button size="small" sx={{ fontSize: '0.6rem', minWidth: 0 }} onClick={() => onVisibleClusters3DChange(new Set())}>NONE</Button>
                  </Box>
                  <Box sx={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {uniqueClusters.map((cluster) => (
                      <Box key={cluster} sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
                        <Checkbox
                          size="small"
                          checked={visibleClusters3D.has(cluster)}
                          onChange={() => {
                            onVisibleClusters3DChange((prev) => {
                              const n = new Set(prev);
                              if (n.has(cluster)) n.delete(cluster);
                              else n.add(cluster);
                              return n;
                            });
                          }}
                          sx={{ p: 0.5, color: panel.ink.ghost, '&.Mui-checked': { color: panel.role.primary } }}
                        />
                        <Typography sx={{ fontSize: '0.75rem', color: panel.ink.body }}>{cluster}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </TextureMenuSpring>
            </div>
          </div>
        </SettingsPanelSpring>
      </div>

      {/* Nav Controls - Bottom Right (Collapsible); optional "See who's new!" stacked above */}
      <div
        style={{
          position: 'absolute',
          ...bottomRightControlsClear(drawerInset),
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '8px',
          minWidth: '180px',
        }}
      >
        {seeWhosNewButtonSlot}
        {!isMobileDevice && (
          <>
            <Button
              variant="outlined"
              onClick={() => setShowNavControls(!showNavControls)}
              sx={{
                backgroundColor: panel.nav.surface,
                borderColor: panel.border.subtle,
                color: panel.nav.ink,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '1px',
                '&:hover': { borderColor: panel.border.subtleHover, backgroundColor: panel.nav.surface },
              }}
            >
              NAV CONTROLS 👁️ {showNavControls ? '▴' : '▾'}
            </Button>
            <SettingsPanelSpring isOpen={showNavControls}>
              <div style={{
                marginTop: '8px',
                backgroundColor: panel.nav.surface,
                padding: '8px 12px',
                borderRadius: '8px',
                color: panel.nav.ink,
                fontSize: '0.7rem',
                border: `1px solid ${panel.border.subtle}`,
                boxShadow: `0 10px 40px ${panel.shadow.floating}`,
                minWidth: '180px',
              }}>
                {navKeys}
              </div>
            </SettingsPanelSpring>
          </>
        )}
      </div>
    </>
  );
}

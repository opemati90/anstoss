/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Photo = {
  id: string
  uploaderId: string
  uploaderName: string
  uploadedAt: string
  imageUrl: string
  caption?: string | null
  votes: number
  myVoted: boolean
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GUTTER = 6
const COL_WIDTH = (SCREEN_WIDTH - 16 * 2 - GUTTER) / 2

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function relativeTime(iso: string, locale: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hrs = Math.round(min / 60)
  if (hrs < 24) return `${hrs}h`
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })
}

export default function PhotoWallScreen() {
  const { t, i18n } = useTranslation()
  // useAuth is intentionally not consumed yet; the upload-as-me identity
  // is resolved server-side from the auth token in mock + real mode.
  useAuth()
  const c = useClubColors()
  const params = useLocalSearchParams<{ fixtureId?: string | string[] }>()
  const fixtureId =
    typeof params.fixtureId === 'string' ? params.fixtureId : null
  const locale = i18n.language

  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!fixtureId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Photo[]>(`/fixtures/${fixtureId}/photos`)
      setPhotos(result ?? [])
    } catch {
      setPhotos([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fixtureId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const sorted = useMemo(
    () =>
      photos
        .slice()
        .sort((a, b) => b.votes - a.votes || b.uploadedAt.localeCompare(a.uploadedAt)),
    [photos],
  )
  const featured = sorted[0] ?? null
  const rest = sorted.slice(1)

  const totalVotes = photos.reduce((sum, p) => sum + p.votes, 0)

  const toggleVote = async (photo: Photo) => {
    if (!fixtureId) return
    setBusyId(photo.id)
    try {
      await api(
        `/fixtures/${fixtureId}/photos/${photo.id}/vote`,
        { method: photo.myVoted ? 'DELETE' : 'POST' },
      )
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('photoWall.voteError', {
          defaultValue: "Couldn't update vote. Try again.",
        }),
      )
    } finally {
      setBusyId(null)
    }
  }

  const addPhoto = async () => {
    if (!fixtureId) return
    // Mock-mode: pretend we picked from camera roll. Real flow would
    // present an ImagePicker; this seeds a placeholder image so the
    // wall populates immediately.
    const seed = Math.random().toString(36).slice(2, 8)
    setBusyId('add')
    try {
      await api(`/fixtures/${fixtureId}/photos`, {
        method: 'POST',
        body: {
          imageUrl: `https://picsum.photos/seed/${seed}/800/600`,
          caption: null,
        },
      })
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('photoWall.uploadError', {
          defaultValue: "Couldn't add photo. Try again.",
        }),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('photoWall.title', { defaultValue: 'Photo wall' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : photos.length === 0 ? (
        <EmptyState
          icon="camera"
          title={t('photoWall.emptyTitle', {
            defaultValue: 'No photos yet',
          })}
          description={t('photoWall.emptyBody', {
            defaultValue:
              'Be the first to drop a match-day photo. The team picks photo of the week from votes.',
          })}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void fetchData()
              }}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('photoWall.eyebrow', { defaultValue: 'PHOTO WALL · TEAM' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('photoWall.headline', {
              defaultValue: "Saturday's photos",
            })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('photoWall.subtitle', {
              defaultValue:
                '{{photos}} photos · {{votes}} votes — vote to crown photo of the week.',
              photos: photos.length,
              votes: totalVotes,
            })}
          </Text>

          {/* Featured photo of the week */}
          {featured ? (
            <View
              style={[
                styles.featuredCard,
                {
                  backgroundColor: c.surface,
                  borderColor: withAlpha(c.primary, 0.4),
                },
              ]}
            >
              <View style={styles.featuredImageWrap}>
                <Image
                  source={{ uri: featured.imageUrl }}
                  style={styles.featuredImage}
                  resizeMode="cover"
                />
                <View
                  style={[
                    styles.crown,
                    { backgroundColor: c.primary },
                  ]}
                >
                  <Icon name="star.fill" size={11} color="inverse" />
                  <Text style={styles.crownText}>
                    {t('photoWall.crownLabel', {
                      defaultValue: 'PHOTO OF THE WEEK',
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.featuredBody}>
                <View style={styles.uploaderRow}>
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: c.surfaceSunken ?? c.background,
                        borderColor: c.borderDefault,
                      },
                    ]}
                  >
                    <Text style={[styles.avatarText, { color: c.textPrimary }]}>
                      {initialsOf(featured.uploaderName)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {featured.uploaderName}
                    </Text>
                    <Text variant="caption2" color="tertiary">
                      {relativeTime(featured.uploadedAt, locale)}
                    </Text>
                  </View>
                  <VoteButton
                    photo={featured}
                    busy={busyId === featured.id}
                    onPress={() => toggleVote(featured)}
                    c={c}
                    big
                  />
                </View>
                {featured.caption ? (
                  <Text variant="footnote" color="primary" style={styles.caption}>
                    {featured.caption}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Two-column grid for the rest */}
          {rest.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
              {t('photoWall.gridLabel', { defaultValue: 'EVERYONE ELSE' })}
            </Text>
          ) : null}
          <View style={styles.grid}>
            {rest.map((photo) => (
              <View
                key={photo.id}
                style={[
                  styles.gridCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <Image
                  source={{ uri: photo.imageUrl }}
                  style={styles.gridImage}
                  resizeMode="cover"
                />
                <View style={styles.gridBody}>
                  <Text variant="caption2" color="primary" weight="semibold" numberOfLines={1}>
                    {photo.uploaderName}
                  </Text>
                  <Text variant="caption2" color="tertiary">
                    {relativeTime(photo.uploadedAt, locale)}
                  </Text>
                  <View style={styles.gridFooter}>
                    <VoteButton
                      photo={photo}
                      busy={busyId === photo.id}
                      onPress={() => toggleVote(photo)}
                      c={c}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('photoWall.footer', {
              defaultValue:
                'Photo of the week is automatically featured every Sunday at 18:00.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* Floating "Add photo" CTA */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('photoWall.addPhoto', {
          defaultValue: 'Add photo',
        })}
        onPress={addPhoto}
        disabled={busyId === 'add'}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.textPrimary },
          pressed && { opacity: 0.85 },
          busyId === 'add' && { opacity: 0.6 },
        ]}
      >
        <Icon name="camera.fill" size="lg" color="inverse" />
      </Pressable>
    </View>
  )
}

function VoteButton({
  photo,
  busy,
  onPress,
  c,
  big,
}: {
  photo: Photo
  busy: boolean
  onPress: () => void
  c: ReturnType<typeof useClubColors>
  big?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={photo.myVoted ? 'Remove vote' : 'Vote'}
      accessibilityState={{ selected: photo.myVoted }}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        big ? styles.voteBig : styles.voteSmall,
        photo.myVoted
          ? { backgroundColor: c.primary, borderColor: c.primary }
          : {
              backgroundColor: c.surface,
              borderColor: c.borderStrong,
            },
        pressed && { opacity: 0.6 },
        busy && { opacity: 0.5 },
      ]}
    >
      <Icon
        name={photo.myVoted ? 'star.fill' : 'star'}
        size={big ? 14 : 12}
        color={photo.myVoted ? c.textInverse : c.textPrimary}
      />
      <Text
        style={[
          big ? styles.voteBigText : styles.voteSmallText,
          { color: photo.myVoted ? c.textInverse : c.textPrimary },
        ]}
        tabular
      >
        {String(photo.votes)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 3,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  featuredCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  featuredImageWrap: { position: 'relative' },
  featuredImage: {
    width: '100%',
    height: 220,
  },
  crown: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  crownText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  featuredBody: {
    padding: space.md,
    gap: space.sm,
  },
  uploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  caption: { lineHeight: 20 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
    marginTop: space.sm,
  },
  gridCard: {
    width: COL_WIDTH,
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    aspectRatio: 1,
  },
  gridBody: {
    padding: 10,
    gap: 4,
  },
  gridFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },

  voteBig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  voteBigText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  voteSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  voteSmallText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  fab: {
    position: 'absolute',
    bottom: space.lg,
    right: space.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
})

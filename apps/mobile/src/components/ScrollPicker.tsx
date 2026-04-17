import { useRef, useCallback, useEffect } from 'react'
import {
  View,
  FlatList,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Text,
} from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import {
  FONT_FAMILY_BOLD,
  FONT_SIZE_BODY,
  FONT_SIZE_H2,
  fonts,
  hairline,
  SPACING_SM,
} from '../theme/tokens'

const ITEM_HEIGHT = 44
const VISIBLE_ITEMS = 5
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS

type ScrollPickerColumnProps = {
  items: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  primaryColor: string
}

function ScrollPickerColumn({ items, selectedIndex, onSelect, primaryColor }: ScrollPickerColumnProps) {
  const c = useClubColors()
  const flatListRef = useRef<FlatList>(null)
  const isUserScroll = useRef(true)

  useEffect(() => {
    if (flatListRef.current && selectedIndex >= 0) {
      isUserScroll.current = false
      flatListRef.current.scrollToOffset({
        offset: selectedIndex * ITEM_HEIGHT,
        animated: false,
      })
    }
  }, [selectedIndex])

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y
      const index = Math.round(offsetY / ITEM_HEIGHT)
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1))
      if (clampedIndex !== selectedIndex) {
        onSelect(clampedIndex)
      }
    },
    [items.length, selectedIndex, onSelect],
  )

  const padCount = Math.floor(VISIBLE_ITEMS / 2)
  const paddedData = [
    ...Array(padCount).fill(''),
    ...items,
    ...Array(padCount).fill(''),
  ]

  const renderItem = ({ item, index }: { item: string; index: number }) => {
    const actualIndex = index - padCount
    const isSelected = actualIndex === selectedIndex
    const isPlaceholder = item === ''

    return (
      <View style={styles.item}>
        {!isPlaceholder && (
          <Text
            style={[
              styles.itemText,
              { color: c.textTertiary },
              isSelected && [styles.itemTextSelected, { color: primaryColor }],
            ]}
          >
            {item}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View style={styles.column}>
      <FlatList
        ref={flatListRef}
        data={paddedData}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
      />
      <View pointerEvents="none" style={[styles.highlight, { borderColor: primaryColor }]} />
    </View>
  )
}

export type ScrollPickerProps = {
  columns: { items: string[]; selectedIndex: number; onSelect: (index: number) => void }[]
  primaryColor: string
}

export function ScrollPicker({ columns, primaryColor }: ScrollPickerProps) {
  return (
    <View style={styles.picker}>
      {columns.map((col, i) => (
        <ScrollPickerColumn
          key={i}
          items={col.items}
          selectedIndex={col.selectedIndex}
          onSelect={col.onSelect}
          primaryColor={primaryColor}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    height: PICKER_HEIGHT,
    overflow: 'hidden',
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: FONT_SIZE_BODY,
    fontFamily: fonts.data,
  },
  itemTextSelected: {
    fontSize: FONT_SIZE_H2,
    fontFamily: FONT_FAMILY_BOLD,
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    left: SPACING_SM,
    right: SPACING_SM,
    height: ITEM_HEIGHT,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
  },
})

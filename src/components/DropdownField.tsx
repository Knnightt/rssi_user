import React, {useMemo, useState} from 'react';
import {FlatList, Modal, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LocalizedText as Text, useLanguage} from '../i18n';
import {styles} from '../theme';

/** A searchable, accessible picker used for administrative location fields. */
export function DropdownField({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const {t} = useLanguage();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? options.filter(option => option.toLocaleLowerCase().includes(needle)) : options;
  }, [options, query]);

  const close = () => {
    setVisible(false);
    setQuery('');
  };
  const select = (option: string) => {
    onSelect(option);
    close();
  };

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{disabled, expanded: visible}}
        disabled={disabled}
        onPress={() => setVisible(true)}
        style={[styles.dropdownTrigger, disabled && styles.dropdownDisabled]}>
        <Text style={[styles.dropdownValue, !value && styles.dropdownPlaceholder]}>{value || placeholder}</Text>
        <Text style={styles.dropdownChevron}>⌄</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <SafeAreaView edges={['bottom']} style={styles.dropdownBackdrop}>
          <View style={styles.dropdownSheet}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{label}</Text>
              <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.dropdownClose}>
                <Text style={styles.dropdownCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('Search')}
              placeholderTextColor="#98A5B8"
              autoCorrect={false}
              style={styles.dropdownSearch}
              accessibilityLabel={t('Search')}
            />
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filteredOptions}
              keyExtractor={item => item}
              initialNumToRender={20}
              renderItem={({item}) => (
                <TouchableOpacity
                  onPress={() => select(item)}
                  accessibilityRole="button"
                  style={[styles.dropdownOption, item === value && styles.dropdownOptionSelected]}>
                  <Text style={[styles.dropdownOptionText, item === value && styles.dropdownOptionTextSelected]}>{item}</Text>
                  {item === value ? <Text style={styles.dropdownCheck}>✓</Text> : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.dropdownEmpty}>{t('No matches')}</Text>}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}


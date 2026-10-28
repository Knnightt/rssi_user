import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {FarmCoordinates} from '../location';
import {LocalizedText as Text, useLanguage} from '../i18n';
import {styles} from '../theme';
import {Button, Field} from './UI';

function coordinateText(value: number | undefined): string {
  return value === undefined ? '' : String(Number(value.toFixed(7)));
}

function parseDecimalCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    return null;
  }

  const coordinate = Number(trimmed);
  return Number.isFinite(coordinate) ? coordinate : null;
}

export function FarmCoordinateFields({
  value,
  onChange,
}: {
  value: FarmCoordinates | null;
  onChange: (coordinates: FarmCoordinates) => void;
}) {
  const {t} = useLanguage();
  const [latitude, setLatitude] = useState(coordinateText(value?.latitude));
  const [longitude, setLongitude] = useState(coordinateText(value?.longitude));
  const [error, setError] = useState('');

  useEffect(() => {
    setLatitude(coordinateText(value?.latitude));
    setLongitude(coordinateText(value?.longitude));
    setError('');
  }, [value?.latitude, value?.longitude]);

  const setMapPinFromCoordinates = () => {
    const nextLatitude = parseDecimalCoordinate(latitude);
    const nextLongitude = parseDecimalCoordinate(longitude);

    if (nextLatitude === null || nextLongitude === null) {
      setError('Enter both latitude and longitude as decimal numbers.');
      return;
    }
    if (nextLatitude < -90 || nextLatitude > 90 || nextLongitude < -180 || nextLongitude > 180) {
      setError('Latitude must be between -90 and 90; longitude between -180 and 180.');
      return;
    }

    setError('');
    onChange({
      latitude: Number(nextLatitude.toFixed(7)),
      longitude: Number(nextLongitude.toFixed(7)),
      source: 'manual',
    });
  };

  return (
    <View style={styles.coordinateFields}>
      <Text style={styles.inputLabel}>{t('Enter GPS coordinates')}</Text>
      <Text style={styles.helperText}>{t('Use decimal degrees, then tap Set map pin. Latitude: -90 to 90; longitude: -180 to 180.')}</Text>
      <View style={styles.coordinateInputRow}>
        <View style={styles.coordinateInputCell}>
          <Field
            label="Latitude"
            value={latitude}
            onChangeText={valueText => {setLatitude(valueText); setError('');}}
            placeholder="9.4083611"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.coordinateInputCell}>
          <Field
            label="Longitude"
            value={longitude}
            onChangeText={valueText => {setLongitude(valueText); setError('');}}
            placeholder="123.0046306"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
      {error ? <Text style={styles.coordinateError}>{t(error)}</Text> : null}
      <Button label={t('Set map pin')} kind="light" onPress={setMapPinFromCoordinates} />
    </View>
  );
}

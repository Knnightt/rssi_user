import React from 'react';
import {Text as NativeText, View} from 'react-native';
import {FieldReport, ReportProgressEvent} from '../api';
import {LocalizedText as Text, useLanguage} from '../i18n';
import {C, styles} from '../theme';
import {Card, Pill} from './UI';

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function titleFor(event: ReportProgressEvent, t: (value: string) => string): string {
  if (event.type === 'submitted') return t('Report submitted');
  if (event.type === 'review') return t('SRA review updated');
  if (event.type === 'visit_scheduled') return t('Follow-up visit scheduled');
  if (event.visit_status === 'completed') return t('Follow-up visit completed');
  if (event.visit_status === 'cancelled') return t('Follow-up visit cancelled');
  return t('Follow-up visit updated');
}

function makeProgress(report: FieldReport): ReportProgressEvent[] {
  const events = report.progress?.length ? [...report.progress] : [{
    id: `submitted-${report.id}`,
    type: 'submitted' as const,
    occurred_at: report.submitted_at,
  }];

  if (!events.some(event => event.type === 'review') && report.verification_status !== 'For verification') {
    events.push({
      id: `review-current-${report.id}`,
      type: 'review',
      occurred_at: report.review_completed_at || report.follow_up_at || report.submitted_at,
      verification_status: report.verification_status,
      sra_severity: report.sra_severity,
      scheduled_for: report.follow_up_at,
      completed_at: report.review_completed_at,
      farmer_message: report.farmer_message,
    });
  }

  return events.sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
}

export function ReportProgressTimeline({report}: {report: FieldReport}) {
  const {t} = useLanguage();
  const events = makeProgress(report);

  return <Card>
    <Text style={styles.cardTitle}>Report progress</Text>
    <Text style={styles.cardSub}>See when your report was submitted, reviewed, and followed up.</Text>
    <View style={{marginTop: 14}}>
      {events.map((event, index) => {
        const statusTone = event.verification_status === 'Confirmed' || event.visit_status === 'completed'
          ? 'green'
          : event.verification_status === 'No detection' || event.visit_status === 'cancelled'
            ? 'gray'
            : 'amber';
        return <View key={event.id} style={{flexDirection: 'row', minHeight: index === events.length - 1 ? 0 : 58}}>
          <View style={{width: 24, alignItems: 'center'}}>
            <View style={{width: 11, height: 11, borderRadius: 6, marginTop: 4, backgroundColor: event.type === 'submitted' ? C.blue : event.visit_status === 'completed' || event.verification_status === 'Confirmed' ? C.green : C.amber}} />
            {index < events.length - 1 ? <View style={{width: 2, flex: 1, minHeight: 42, backgroundColor: C.line, marginTop: 4}} /> : null}
          </View>
          <View style={{flex: 1, paddingBottom: index === events.length - 1 ? 0 : 18}}>
            <Text style={{fontSize: 13, fontWeight: '800', color: C.ink}}>{titleFor(event, t)}</Text>
            <Text style={styles.helperText}>{dateLabel(event.occurred_at)}</Text>
            {event.verification_status ? <View style={{alignSelf: 'flex-start', marginTop: 6}}><Pill text={event.verification_status} tone={statusTone} /></View> : null}
            {event.sra_severity ? <Text style={[styles.bodyText, {marginTop: 6}]}>{t('SRA severity')}: {t(event.sra_severity)}</Text> : null}
            {event.scheduled_for ? <Text style={[styles.bodyText, {marginTop: 6}]}>{t('Scheduled visit')}: {dateLabel(event.scheduled_for)}</Text> : null}
            {event.completed_at ? <Text style={[styles.bodyText, {marginTop: 6}]}>{t('Report completed')}: {dateLabel(event.completed_at)}</Text> : null}
            {event.farmer_message ? <View style={{marginTop: 8, padding: 10, borderLeftWidth: 3, borderRadius: 8, borderLeftColor: C.blue, backgroundColor: C.paleBlue}}>
              <Text style={{fontSize: 11, fontWeight: '800', color: C.blue}}>{t('Message from SRA')}</Text>
              <NativeText style={[styles.bodyText, {marginTop: 4}]}>{event.farmer_message}</NativeText>
            </View> : null}
            {event.findings ? <View style={{marginTop: 8}}>
              <Text style={{fontSize: 11, fontWeight: '800', color: C.ink}}>{t('Visit findings')}</Text>
              <NativeText style={[styles.bodyText, {marginTop: 4}]}>{event.findings}</NativeText>
            </View> : null}
            {event.checkings?.length ? <View style={{marginTop: 8}}>
              <Text style={{fontSize: 11, fontWeight: '800', color: C.ink}}>{t('Visit checks')}</Text>
              {event.checkings.map((checking, checkIndex) => <View key={`${event.id}-check-${checkIndex}`} style={{marginTop: 5}}>
                <Text style={styles.bodyText}>{checking.label} · {t(checking.result.replaceAll('_', ' '))}</Text>
                {checking.finding ? <NativeText style={[styles.helperText, {marginTop: 2}]}>{checking.finding}</NativeText> : null}
              </View>)}
            </View> : null}
          </View>
        </View>;
      })}
    </View>
  </Card>;
}

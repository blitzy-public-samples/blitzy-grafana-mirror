import { css } from '@emotion/css';

import { Trans, t } from '@grafana/i18n';
import { Tooltip, useStyles2 } from '@grafana/ui';

const UnknownContactPointDetails = ({ receiverName }: { receiverName?: string }) => {
  const styles = useStyles2(getStyles);
  return (
    <span className={styles.wrapper}>
      <Tooltip
        content={t(
          'alerting.unknown-contact-point-details.unknown-contact-point-tooltip',
          'Details could not be found. This may be because you do not have access to the contact point'
        )}
      >
        <span>
          {receiverName ? (
            receiverName
          ) : (
            <Trans i18nKey="alerting.unknown-contact-point-details.unknown-contact-point">Unknown contact point</Trans>
          )}
        </span>
      </Tooltip>
    </span>
  );
};

const getStyles = () => ({
  wrapper: css({
    cursor: 'help',
  }),
});

export default UnknownContactPointDetails;

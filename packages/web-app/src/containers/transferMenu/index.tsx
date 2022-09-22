import React from 'react';
import styled from 'styled-components';
import {generatePath, useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {ActionListItem, IconChevronRight} from '@aragon/ui-components';

import {NewDeposit, NewWithDraw} from 'utils/paths';
import {useWallet} from 'hooks/useWallet';
import {useGlobalModalContext} from 'context/globalModals';
import ModalBottomSheetSwitcher from 'components/modalBottomSheetSwitcher';
import {useNetwork} from 'context/network';
import {trackEvent} from 'services/analytics';

type Action = 'deposit_assets' | 'withdraw_assets';

const TransferMenu: React.FC = () => {
  const {isTransferOpen, close, open} = useGlobalModalContext();
  const {t} = useTranslation();
  const {network} = useNetwork();
  const {dao} = useParams();
  const navigate = useNavigate();
  const {isConnected} = useWallet();

  const handleClick = (action: Action) => {
    trackEvent('newTransfer_modalBtn_clicked', {
      dao_address: dao,
      action,
    });

    if (!isConnected) {
      open('wallet');
    } else if (action === 'deposit_assets') {
      navigate(generatePath(NewDeposit, {network: network, dao: dao}));
    } else {
      navigate(generatePath(NewWithDraw, {network: network, dao: dao}));
    }
    close('default');
  };

  return (
    <ModalBottomSheetSwitcher
      isOpen={isTransferOpen}
      onClose={() => close('default')}
      title={t('TransferModal.newTransfer') as string}
    >
      <Container>
        <ActionListItem
          title={t('TransferModal.item1Title') as string}
          subtitle={t('TransferModal.item1Subtitle') as string}
          icon={<IconChevronRight />}
          onClick={() => handleClick('deposit_assets')}
        />
        <ActionListItem
          title={t('TransferModal.item2Title') as string}
          subtitle={t('TransferModal.item2Subtitle') as string}
          icon={<IconChevronRight />}
          onClick={() => handleClick('withdraw_assets')}
        />
      </Container>
    </ModalBottomSheetSwitcher>
  );
};

export default TransferMenu;

const Container = styled.div.attrs({
  className: 'space-y-1.5 p-3',
})``;

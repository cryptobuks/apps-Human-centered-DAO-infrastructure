import {
  ICreateProposalParams,
  InstalledPluginListItem,
  ProposalCreationSteps,
} from '@aragon/sdk-client';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useFormContext} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {generatePath, useNavigate} from 'react-router-dom';

import {Loading} from 'components/temporary';
import PublishModal from 'containers/transactionModals/publishModal';
import {useDaoParam} from 'hooks/useDaoParam';
import {PluginTypes, usePluginClient} from 'hooks/usePluginClient';
import {usePollGasFee} from 'hooks/usePollGasfee';
import {useWallet} from 'hooks/useWallet';
import {TransactionState} from 'utils/constants';
import {Governance} from 'utils/paths';
import {useGlobalModalContext} from './globalModals';
import {useNetwork} from './network';
import {useDaoDetails} from 'hooks/useDaoDetails';
import {getCanonicalUtcOffset} from 'utils/date';

type Props = {
  showTxModal: boolean;
  setShowTxModal: (value: boolean) => void;
};

const CreateProposalProvider: React.FC<Props> = ({
  showTxModal,
  setShowTxModal,
  children,
}) => {
  const navigate = useNavigate();
  const {network} = useNetwork();
  const {getValues} = useFormContext();
  const {t} = useTranslation();
  const {isOnWrongNetwork} = useWallet();
  const {open} = useGlobalModalContext();
  const {data: dao, isLoading} = useDaoParam();
  const {data: daoDetails, isLoading: daoDetailsLoading} = useDaoDetails(dao);

  const {id: pluginType, instanceAddress: pluginAddress} =
    daoDetails?.plugins[0] || ({} as InstalledPluginListItem);

  const pluginClient = usePluginClient(
    pluginAddress,
    pluginType as PluginTypes
  );

  const [creationProcessState, setCreationProcessState] =
    useState<TransactionState>(TransactionState.WAITING);

  const shouldPoll = useMemo(
    () => creationProcessState === TransactionState.WAITING,
    [creationProcessState]
  );

  // Because getValues does NOT get updated on each render, leaving this as
  // a function to be called when data is needed instead of a memoized value
  const getProposalCreationParams = useCallback((): ICreateProposalParams => {
    const [
      title,
      summary,
      description,
      resources,
      startDate,
      startTime,
      startUtc,
      endDate,
      endTime,
      endUtc,
    ] = getValues([
      'proposalTitle',
      'proposalSummary',
      'proposal',
      'links',
      'startDate',
      'startTime',
      'startUtc',
      'endDate',
      'endTime',
      'endUtc',
    ]);

    return {
      pluginAddress,
      metadata: {
        title,
        summary,
        description,
        resources,
      },
      startDate: new Date(
        `${startDate}T${startTime}:00${getCanonicalUtcOffset(startUtc)}`
      ),
      endDate: new Date(
        `${endDate}T${endTime}:00${getCanonicalUtcOffset(endUtc)}`
      ),
    };
  }, [getValues, pluginAddress]);

  const encodeActions = useMemo(() => {
    const actions = getValues().actions;
    // return actions?.map((action: Record<string, string>) => {
    console.log('action', actions);
    // if (action.name === 'withdraw_assets') {
    // doesn't matter which client we use to encode actions, both are the same
    // return pluginClient?.encode.actions.withdraw(
    //   action.to,
    //   BigInt(parseUnits(action.amount, 18).toBigInt()),
    //   {
    //     to: action.to,
    //     token: action.tokenAddress,
    //     amount: BigInt(parseUnits(action.amount, 18).toBigInt()),
    //     reference: action.reference,
    //   }
    // );
    // }
    // });
  }, [getValues]);

  const estimateCreationFees = useCallback(async () => {
    if (!pluginClient) {
      return Promise.reject(
        new Error('ERC20 SDK client is not initialized correctly')
      );
    }

    return pluginClient?.estimation.createProposal(getProposalCreationParams());
  }, [getProposalCreationParams, pluginClient]);

  const {tokenPrice, maxFee, averageFee, stopPolling} = usePollGasFee(
    estimateCreationFees,
    shouldPoll
  );

  const handleCloseModal = () => {
    switch (creationProcessState) {
      case TransactionState.LOADING:
        break;
      case TransactionState.SUCCESS:
        navigate(generatePath(Governance, {network, dao}));
        break;
      default: {
        setCreationProcessState(TransactionState.WAITING);
        setShowTxModal(false);
        stopPolling();
      }
    }
  };

  const handlePublishProposal = async () => {
    if (!pluginClient) {
      return new Error('ERC20 SDK client is not initialized correctly');
    }

    const proposalIterator = pluginClient.methods.createProposal(
      getProposalCreationParams()
    );

    if (creationProcessState === TransactionState.SUCCESS) {
      handleCloseModal();
      return;
    }

    if (isOnWrongNetwork) {
      open('network');
      handleCloseModal();
      return;
    }

    setCreationProcessState(TransactionState.LOADING);
    for await (const step of proposalIterator) {
      try {
        switch (step.key) {
          case ProposalCreationSteps.CREATING:
            console.log(step.txHash);
            break;
          case ProposalCreationSteps.DONE:
            setCreationProcessState(TransactionState.SUCCESS);
            break;
        }
      } catch (error) {
        console.error(error);
        setCreationProcessState(TransactionState.ERROR);
      }
    }
  };

  /*************************************************
   *                    Render                     *
   *************************************************/

  if (isLoading || daoDetailsLoading) {
    return <Loading />;
  }

  return (
    <>
      {children}
      <PublishModal
        state={creationProcessState || TransactionState.WAITING}
        isOpen={showTxModal}
        onClose={handleCloseModal}
        // callback={handlePublishProposal}
        callback={() => getProposalCreationParams()}
        closeOnDrag={creationProcessState !== TransactionState.LOADING}
        maxFee={maxFee}
        averageFee={averageFee}
        tokenPrice={tokenPrice}
        title={t('TransactionModal.createProposal')}
        buttonLabel={t('TransactionModal.createProposalNow')}
      />
    </>
  );
};

export {CreateProposalProvider};

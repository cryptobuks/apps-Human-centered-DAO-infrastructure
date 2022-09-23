import {
  ClientErc20,
  ICreateProposalParams,
  InstalledPluginListItem,
  ProposalCreationSteps,
} from '@aragon/sdk-client';
import React, {useCallback, useMemo, useState} from 'react';
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
import {useClient} from 'hooks/useClient';
import {Action} from 'utils/types';
import {DaoAction} from '@aragon/sdk-client/dist/internal/interfaces/common';

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
  const {client} = useClient();

  const {id: pluginType, instanceAddress: pluginAddress} =
    daoDetails?.plugins[0] || ({} as InstalledPluginListItem);

  const pluginClient = usePluginClient(
    pluginAddress,
    pluginType as PluginTypes
  );

  const [creationProcessState, setCreationProcessState] =
    useState<TransactionState>(TransactionState.WAITING);

  const shouldPoll = useMemo(
    () => creationProcessState === TransactionState.WAITING && showTxModal,
    [creationProcessState, showTxModal]
  );

  const encodeActions = useCallback(async () => {
    const actionsFromForm = getValues('actions');
    const actions: Array<Promise<DaoAction>> = [];

    // return an empty array for undefined clients
    if (!pluginClient || !client) return Promise.resolve([] as DaoAction[]);

    actionsFromForm.forEach((action: Action) => {
      switch (action.name) {
        case 'withdraw_assets':
          actions.push(
            client.encoding.withdrawAction(dao, {
              recipientAddress: action.to,
              amount: BigInt(Number(action.amount) * Math.pow(10, 18)),
              tokenAddress: action.tokenAddress,
            })
          );
          break;
        case 'mint_tokens':
          action.inputs.mintTokensToWallets.forEach(mint => {
            actions.push(
              Promise.resolve(
                (pluginClient as ClientErc20).encoding.mintTokenAction(
                  action.summary.daoTokenAddress,
                  {
                    address: mint.address,
                    amount: BigInt(Number(mint.amount) * Math.pow(10, 18)),
                  }
                )
              )
            );
          });
          break;
      }
    });

    return Promise.all(actions);
  }, [client, dao, getValues, pluginClient]);

  // Because getValues does NOT get updated on each render, leaving this as
  // a function to be called when data is needed instead of a memoized value
  const getProposalCreationParams =
    useCallback(async (): Promise<ICreateProposalParams> => {
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

      const actions = await encodeActions();

      // Ignore encoding if the proposal had no actions
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
        actions,
      };
    }, [encodeActions, getValues, pluginAddress]);

  const estimateCreationFees = useCallback(async () => {
    if (!pluginClient) {
      return Promise.reject(
        new Error('ERC20 SDK client is not initialized correctly')
      );
    }
    return pluginClient?.estimation.createProposal(
      await getProposalCreationParams()
    );
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
      await getProposalCreationParams()
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
        callback={handlePublishProposal}
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

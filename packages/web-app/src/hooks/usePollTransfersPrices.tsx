import {useApolloClient} from '@apollo/client';
import {
  AssetDeposit,
  AssetWithdrawal,
  IAssetTransfers,
} from '@aragon/sdk-client/dist/internal/interfaces/client';

import {useNetwork} from 'context/network';
import {constants} from 'ethers';
import {useEffect, useState} from 'react';
import {fetchTokenData} from 'services/prices';
import {
  CHAIN_METADATA,
  SupportedNetworks,
  TransferTypes,
} from 'utils/constants';
import {formatDate} from 'utils/date';
import {formatUnits} from 'utils/library';
import {HookData, Transfer} from 'utils/types';
import {i18n} from '../../i18n.config';

export const usePollTransfersPrices = (
  transfers: IAssetTransfers
): HookData<{transfers: Transfer[]; totalTransfersValue: string}> => {
  const client = useApolloClient();
  const {network} = useNetwork();

  const [data, setData] = useState<Transfer[]>([]);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [totalTransfersValue, setTotalTransfersValue] = useState('');

  useEffect(() => {
    const fetchMetadata = async (assetTransfers: Transfer[]) => {
      try {
        setLoading(true);
        let total = 0;

        // fetch token metadata from external api
        const metadata = await Promise.all(
          assetTransfers?.map(transfer => {
            return fetchTokenData(transfer.tokenAddress, client, network);
          })
        );

        // map metadata to token balances
        const tokensWithMetadata: Transfer[] = assetTransfers?.map(
          (transfer, index: number) => {
            let calculatedPrice = 0;

            if (metadata[index]?.price) {
              calculatedPrice =
                Number(transfer.tokenAmount) * Number(metadata[index]?.price);
              total = total + calculatedPrice;
            }

            return {
              ...transfer,
              usdValue: `$${calculatedPrice.toFixed(2)}`,
              tokenImgUrl: metadata[index]?.imgUrl || '',
            };
          }
        );
        setData(tokensWithMetadata);
        setTotalTransfersValue(`$${total.toFixed(2)}`);
      } catch (error) {
        console.error(error);
        setError(error as Error);
      }

      setLoading(false);
    };

    if (transfers) fetchMetadata(mapToDaoTransfers(transfers, network));
  }, [network, client, transfers]);

  return {
    data: {transfers: data, totalTransfersValue},
    error,
    isLoading: loading,
  };
};

/**
 * Map SDK data to DAO transfer
 * We should not do this in the SDK
 * @param transfers Asset transfers from the SDK
 * @param network Currently selected network
 * @returns List of objects of type Transfer
 */
function mapToDaoTransfers(
  transfers: IAssetTransfers,
  network: SupportedNetworks
) {
  const length =
    transfers.deposits.length > transfers.withdrawals.length
      ? transfers.deposits.length
      : transfers.withdrawals.length;

  const daoTransfers: Transfer[] = [];
  let transfer: AssetDeposit | AssetWithdrawal;

  for (let i = 0; i < length; i++) {
    // map deposit to Transfer
    transfer = transfers.deposits[i];
    if (transfer)
      daoTransfers.push({
        title: transfer.reference
          ? transfer.reference
          : i18n.t('labels.deposit'),
        sender: transfer.from,
        transferType: TransferTypes.Deposit,
        id: transfer.transactionId,
        transferDate: transfer.date
          ? `${formatDate(transfer.date.getTime() / 1000, 'relative')}`
          : i18n.t('labels.pendingTransaction'),
        transferTimestamp: transfer.date?.getTime(),
        usdValue: '',
        isPending: !transfer.date,
        reference: transfer.reference,
        transaction: transfer.transactionId,
        tokenImgUrl: '',
        ...(transfer.type === 'native'
          ? {
              tokenAddress: constants.AddressZero,
              tokenName: CHAIN_METADATA[network].nativeCurrency.name,
              tokenSymbol: CHAIN_METADATA[network].nativeCurrency.symbol,
              tokenAmount: formatUnits(
                transfer.amount,
                CHAIN_METADATA[network].nativeCurrency.decimals
              ),
            }
          : {
              tokenName: transfer.name,
              tokenAddress: transfer.address,
              tokenSymbol: transfer.symbol,
              tokenAmount: formatUnits(transfer.amount, transfer.decimals),
            }),
      });

    // map withdraw to Transfer
    transfer = transfers.withdrawals[i];
    if (transfer)
      daoTransfers.push({
        id: transfer.transactionId,
        title: transfer.reference
          ? transfer.reference
          : i18n.t('labels.withdraw'),
        transferType: TransferTypes.Withdraw,
        to: transfer.to,
        proposalId: transfer.transactionId,
        transferTimestamp: transfer.date?.getTime(),
        transferDate: `${formatDate(
          transfer.date.getTime() / 1000,
          'relative'
        )}`,
        usdValue: '',
        isPending: false,
        reference: transfer.reference,
        transaction: transfer.transactionId,
        tokenImgUrl: '',
        ...(transfer.type === 'native'
          ? {
              tokenAddress: constants.AddressZero,
              tokenName: CHAIN_METADATA[network].nativeCurrency.name,
              tokenSymbol: CHAIN_METADATA[network].nativeCurrency.symbol,
              tokenAmount: formatUnits(
                transfer.amount,
                CHAIN_METADATA[network].nativeCurrency.decimals
              ),
            }
          : {
              tokenName: transfer.name,
              tokenAddress: transfer.address,
              tokenSymbol: transfer.symbol,
              tokenAmount: formatUnits(transfer.amount, transfer.decimals),
            }),
      });
  }

  return daoTransfers;
}

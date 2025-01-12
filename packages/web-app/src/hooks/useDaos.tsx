import {DaoDetails, DaoSortBy} from '@aragon/sdk-client';
import {useEffect, useState} from 'react';

import {ExploreFilter} from 'containers/daoExplorer';
import {HookData} from 'utils/types';
import {useClient} from './useClient';

/**
 * This hook returns a list of daos. The data returned for each dao contains
 * information about the dao such as metadata, plugins installed on the dao,
 * address, etc.
 *
 * The hook takes a single argument that determines the criteria for which DAOs
 * will be returned. This can be either popular or newest DAOs, or DAOs that a
 * user has favourited.
 *
 * @param useCase filter criteria that should be applied when fetching daos
 * @param count number of DAOs to fetch at once.
 * @returns A list of Daos and their respective infos (metadata, plugins, etc.)
 */
export function useDaos(
  useCase: ExploreFilter,
  count: number
): HookData<DaoDetails[]> {
  const [data, setData] = useState<DaoDetails[]>([] as DaoDetails[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const {client} = useClient();

  useEffect(() => {
    async function fetchDaos() {
      if (useCase === 'favourite') {
        // TODO get favourited DAO from local storage. This is out of scope for
        // the alpha. [VR 21-09-2022]
        throw Error('Not yet implemented');
      }

      const sortParam =
        useCase === 'popular' ? DaoSortBy.POPULARITY : DaoSortBy.CREATED_AT;
      const daoDetails =
        (await client?.methods.getDaos({sortBy: sortParam, limit: count})) ||
        [];
      setData(daoDetails);
    }
    try {
      fetchDaos();
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [client?.methods, useCase, count]);

  return {data, isLoading: loading, error};
}

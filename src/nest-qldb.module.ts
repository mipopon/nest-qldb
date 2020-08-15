import { Module, DynamicModule, FactoryProvider } from '@nestjs/common';
import { AsyncProvider, ImportableFactoryProvider } from './types';
import { QldbDriver } from 'amazon-qldb-driver-nodejs';
import { Repository } from './repository';
import { createQldbRepositoryToken, QLDB_DRIVER_TOKEN } from './tokens';
import { TableRegistrations } from './decorators';
import { QldbQueryService } from './query.service';

@Module({})
export class NestQldbModule {
  static forRoot(moduleOptions: {
    qldbDriver: QldbDriver;
    createTablesAndIndexes?: boolean;
  }): DynamicModule {
    return this.forRootAsync({
      qldbDriver: {
        useValue: moduleOptions.qldbDriver,
      },
      createTablesAndIndexes: !!moduleOptions.createTablesAndIndexes,
    });
  }

  static forRootAsync(moduleOptions: {
    qldbDriver: AsyncProvider<QldbDriver | Promise<QldbDriver>>;
    createTablesAndIndexes: boolean;
  }): DynamicModule {
    const module: DynamicModule = {
      global: true,
      module: NestQldbModule,
      imports: [],
      providers: [QldbQueryService],
      exports: [QldbQueryService],
    };

    this.addAsyncProvider(
      module,
      QLDB_DRIVER_TOKEN,
      moduleOptions.qldbDriver,
      true,
    );

    this.createRepositoryProviders(
      moduleOptions.createTablesAndIndexes,
    ).forEach(cp => {
      module.providers.push(cp);
      module.exports.push(cp.provide);
    });

    return module;
  }

  private static addAsyncProvider<T>(
    module: DynamicModule,
    provide: string,
    asyncProvider: AsyncProvider<T>,
    exportable: boolean,
  ) {
    const imports = (asyncProvider as ImportableFactoryProvider<T>).imports;
    if (imports?.length) {
      imports.forEach(i => module.imports.push(i));
    }
    delete (asyncProvider as ImportableFactoryProvider<T>).imports;

    module.providers.push({
      ...asyncProvider,
      provide,
    });

    if (exportable) {
      module.exports.push(provide);
    }
  }

  private static createRepositoryProviders = (
    createTablesAndIndexes: boolean,
  ): FactoryProvider<Promise<Repository<any>>>[] => {
    return TableRegistrations.keys().map(key => {
      const tableName = TableRegistrations.get(key)?.tableName?.length
        ? TableRegistrations.get(key)?.tableName
        : `${key.name.toLowerCase()}s`;

      const indexes = TableRegistrations.get(key)?.tableIndexes as string[];

      return {
        provide: createQldbRepositoryToken(key),
        useFactory: async (queryService: QldbQueryService) => {
          const repository = new Repository(queryService, tableName);

          if (createTablesAndIndexes) {
            await repository.createTableAndIndexes(indexes);
          }

          return repository;
        },
        inject: [QldbQueryService],
      };
    });
  };
}

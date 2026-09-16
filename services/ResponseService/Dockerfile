FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY services/Contracts/Contracts.csproj services/Contracts/
COPY services/ResponseService/ResponseService.csproj services/ResponseService/
RUN dotnet restore services/ResponseService/ResponseService.csproj

COPY services/Contracts/ services/Contracts/
COPY services/ResponseService/ services/ResponseService/
RUN dotnet publish services/ResponseService/ResponseService.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=30s \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "ResponseService.dll"]
